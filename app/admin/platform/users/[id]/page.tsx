import PlatformUserDetailPage from "./PlatformUserDetailClient";

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function Page() {
  return <PlatformUserDetailPage />;
}
