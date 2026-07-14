import { NextRequest, NextResponse } from "next/server";

import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "work-journal-images";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

async function currentEmployee(authUid: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("employees").select("id, employee_type").eq("auth_uid", authUid).maybeSingle();
  return data?.id ? { admin, employeeId: data.id as string, isAdmin: data.employee_type === "관리자" } : null;
}

export async function POST(request: NextRequest) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);
  const current = await currentEmployee(user.id);
  if (!current) return NextResponse.json({ error: "직원 정보를 찾을 수 없습니다." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const requestedEmployeeId = form.get("employee_id");
  const targetEmployeeId = typeof requestedEmployeeId === "string" && requestedEmployeeId ? requestedEmployeeId : current.employeeId;
  if (targetEmployeeId !== current.employeeId && !current.isAdmin) {
    return NextResponse.json({ error: "다른 직원의 메모보드는 관리자만 수정할 수 있습니다." }, { status: 403 });
  }
  if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "JPG, PNG, GIF, WebP 이미지만 붙일 수 있습니다." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "이미지는 10MB 이하여야 합니다." }, { status: 400 });

  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const storagePath = `${targetEmployeeId}/board/${crypto.randomUUID()}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await current.admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const [{ count }, { data: topNote }, { data: topImage }] = await Promise.all([
    current.admin.from("work_journal_board_images").select("id", { count: "exact", head: true }).eq("employee_id", targetEmployeeId),
    current.admin.from("work_journal_notes").select("z_index").eq("employee_id", targetEmployeeId).order("z_index", { ascending: false }).limit(1).maybeSingle(),
    current.admin.from("work_journal_board_images").select("z_index").eq("employee_id", targetEmployeeId).order("z_index", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const offset = ((count ?? 0) % 8) * 22;
  const nextLayer = Math.max(topNote?.z_index ?? 0, topImage?.z_index ?? 0) + 1;
  const { data, error } = await current.admin.from("work_journal_board_images").insert({
    employee_id: targetEmployeeId,
    storage_path: storagePath,
    position_x: 24 + offset,
    position_y: 24 + offset,
    z_index: nextLayer,
  }).select("*").single();
  if (error) {
    await current.admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const publicUrl = current.admin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  return NextResponse.json({ image: { ...data, public_url: publicUrl } });
}

export async function DELETE(request: NextRequest) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);
  const current = await currentEmployee(user.id);
  if (!current) return NextResponse.json({ error: "직원 정보를 찾을 수 없습니다." }, { status: 403 });
  const { id } = await request.json();
  const { data: image } = await current.admin.from("work_journal_board_images").select("id, employee_id, storage_path").eq("id", id).maybeSingle();
  if (!image || (image.employee_id !== current.employeeId && !current.isAdmin)) {
    return NextResponse.json({ error: "이미지를 찾을 수 없거나 삭제 권한이 없습니다." }, { status: 404 });
  }
  const { error } = await current.admin.from("work_journal_board_images").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await current.admin.storage.from(BUCKET).remove([image.storage_path]);
  return NextResponse.json({ ok: true });
}
