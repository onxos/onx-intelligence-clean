import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50" dir="rtl">
      <Card className="max-w-md text-center">
        <CardContent className="p-8 space-y-4">
          <div className="text-8xl font-extrabold text-amber-200">404</div>
          <h1 className="text-2xl font-bold text-amber-900">الصفحة غير موجودة</h1>
          <p className="text-gray-600">الصفحة التي تبحث عنها غير موجودة في ONX Intelligence</p>
          <Link to="/"><Button>العودة للرئيسية</Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}
