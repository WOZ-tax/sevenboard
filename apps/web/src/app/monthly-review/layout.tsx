// 旧ルート。/accounting-review へリダイレクトされるため metadata は不要だが、
// Next.js のルーティング仕様で layout は残す。
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
