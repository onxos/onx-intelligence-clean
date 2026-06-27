import { ProjectDetailsClient } from "./project-details-client";

export function generateStaticParams() {
  return [{ id: "demo-project" }];
}

export default function ProjectDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  return <ProjectDetailsClient id={params.id} />;
}
