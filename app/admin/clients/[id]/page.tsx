import TenantDetailPage from "./TenantDetailClient";

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function Page() {
  return <TenantDetailPage />;
}
