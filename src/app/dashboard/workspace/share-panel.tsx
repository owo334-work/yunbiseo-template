"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type { SharedNote } from "@/lib/types";

import { SharedNotesBoard } from "../work-status/[id]/shared-notes-board";

// 워크스페이스 우측 공유 패널: '전 직원 공유' + '내 부서 팀 공유' 두 보드를 모아 보여준다.
// 업무현황(직원별) 페이지와 달리 대상 직원이 없으므로, 팀 공유란은 "로그인한 나"의 부서 기준이다.
export function SharePanel() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{
    id: string | null;
    isAdmin: boolean;
    department: string | null;
  }>({
    id: null,
    isAdmin: false,
    department: null,
  });
  const [companyNotes, setCompanyNotes] = useState<SharedNote[]>([]);
  const [teamNotes, setTeamNotes] = useState<SharedNote[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const notesSelect =
        "*, author:employees!shared_notes_author_fkey(id, name)";

      // 로그인 사용자(부서/관리자 여부) 확인
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let myInfo = {
        id: null as string | null,
        isAdmin: false,
        department: null as string | null,
      };
      if (user) {
        const { data: meRow } = await supabase
          .from("employees")
          .select("id, employee_type, department")
          .eq("auth_uid", user.id)
          .maybeSingle();
        if (meRow) {
          myInfo = {
            id: meRow.id,
            isAdmin: meRow.employee_type === "관리자",
            department: meRow.department,
          };
        }
      }

      // 공유글 조회 (팀 공유는 내 부서 기준)
      const companyReq = supabase
        .from("shared_notes")
        .select(notesSelect)
        .eq("scope", "company")
        .order("created_at", { ascending: true });
      const teamReq = myInfo.department
        ? supabase
            .from("shared_notes")
            .select(notesSelect)
            .eq("scope", "team")
            .eq("team_key", myInfo.department)
            .order("created_at", { ascending: true })
        : null;
      const [companyRes, teamRes] = await Promise.all([companyReq, teamReq]);

      if (cancelled) return;
      setMe(myInfo);
      setCompanyNotes(
        companyRes.error ? [] : ((companyRes.data ?? []) as SharedNote[]),
      );
      setTeamNotes(
        !teamRes || teamRes.error ? [] : ((teamRes.data ?? []) as SharedNote[]),
      );
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // SharedNotesBoard 는 notes 를 초기값으로만 받으므로, 로딩이 끝난 뒤에 마운트한다.
  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="rounded-[1rem] border-border/70 bg-card/60">
          <CardContent className="p-6 text-center text-xs text-muted-foreground">
            공유 정보란을 불러오는 중입니다.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SharedNotesBoard
        scope="company"
        teamKey={null}
        title="전 직원 공유"
        description="회사 전체가 함께 보는 공유 정보란입니다."
        notes={companyNotes}
        currentEmployeeId={me.id}
        isAdmin={me.isAdmin}
        canPost={me.id != null}
      />
      {me.department ? (
        <SharedNotesBoard
          scope="team"
          teamKey={me.department}
          title={`${me.department} 팀 공유`}
          description="같은 부서 직원끼리 보는 공유 정보란입니다."
          notes={teamNotes}
          currentEmployeeId={me.id}
          isAdmin={me.isAdmin}
          canPost={me.id != null}
          disabledHint="같은 부서 직원만 이 팀 보드에 글을 쓸 수 있습니다."
        />
      ) : (
        <Card className="rounded-[1rem] border-dashed border-border/70 bg-card/60">
          <CardContent className="p-6 text-center text-xs text-muted-foreground">
            내 부서가 지정되어 있지 않아 팀 공유란이 없습니다.
            <br />
            (직원관리에서 부서를 설정하면 팀 공유란이 생깁니다.)
          </CardContent>
        </Card>
      )}
    </div>
  );
}
