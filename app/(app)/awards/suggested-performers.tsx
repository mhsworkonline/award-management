"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { quickAssignAward } from "@/lib/actions/awards";
import type { Lookups } from "@/lib/types";

type TopPerformer = {
  academic_record_id: string;
  percentage: number | null;
  rank: number | null;
  roll_no: string | null;
  student_name: string;
  father_name: string | null;
  institution_name: string;
  placement: string;
};

/** Ranked by percentage, filtered to records with no award yet. A shortcut
 *  alongside the manual picker — never the only way to assign an award. */
export function SuggestedPerformers({
  performers,
  lookups,
}: {
  performers: TopPerformer[];
  lookups: Lookups;
}) {
  const router = useRouter();
  const [categoryFor, setCategoryFor] = React.useState<Record<string, string>>({});
  const [assigning, setAssigning] = React.useState<string | null>(null);

  async function assign(academic_record_id: string) {
    const categoryId = categoryFor[academic_record_id] ?? lookups.awardCategories[0]?.id;
    if (!categoryId) {
      toast.error("Add an award category under Settings first");
      return;
    }

    setAssigning(academic_record_id);
    const result = await quickAssignAward({ academic_record_id, award_category_id: categoryId });
    setAssigning(null);

    if (!result.ok) {
      toast.error("Could not assign", { description: result.error });
      return;
    }
    toast.success("Award assigned");
    router.refresh();
  }

  if (performers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Suggested top performers
        </CardTitle>
        <CardDescription>
          Ranked by percentage, not yet awarded. A shortcut — manual assignment above still
          works for anyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {performers.map((p) => (
          <div
            key={p.academic_record_id}
            className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5"
          >
            <Trophy className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{p.student_name}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {p.institution_name} · {p.placement}
                {p.roll_no ? ` · Roll ${p.roll_no}` : ""}
              </p>
            </div>
            <Badge variant="secondary">{p.percentage}%</Badge>
            {p.rank && <Badge variant="outline">Rank {p.rank}</Badge>}

            <Select
              value={categoryFor[p.academic_record_id] ?? lookups.awardCategories[0]?.id ?? ""}
              onValueChange={(v) =>
                setCategoryFor((prev) => ({ ...prev, [p.academic_record_id]: v }))
              }
            >
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {lookups.awardCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              onClick={() => void assign(p.academic_record_id)}
              disabled={assigning === p.academic_record_id}
            >
              {assigning === p.academic_record_id ? <Loader2 className="animate-spin" /> : "Assign"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
