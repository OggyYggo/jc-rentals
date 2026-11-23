export const metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: LayoutProps<"/auth">) {
  return children;
}
