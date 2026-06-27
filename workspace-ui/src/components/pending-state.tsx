import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export function PendingState({ message }: { message: string }) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("common.backendEndpointPending")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">{message}</p>
      </CardContent>
    </Card>
  );
}
