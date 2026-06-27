import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PendingState({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Backend Endpoint Pending</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">{message}</p>
      </CardContent>
    </Card>
  );
}
