"use client";

import Link from "next/link";
import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";

export default function ProjectsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-3 text-sm text-slate-700">
          Project details route: <Link className="font-semibold underline" href="/projects/demo-project">/projects/demo-project</Link>
        </CardContent>
      </Card>
      <DomainScreen
        title="Projects"
        description="Project domain from backend API."
        queryKey={["projects"]}
        queryFn={api.workspace.projects}
      />
    </div>
  );
}
