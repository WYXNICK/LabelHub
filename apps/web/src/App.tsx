import { App as AntApp, ConfigProvider } from "antd";
import { lazy, Suspense, useEffect } from "react";

import { useCurrentPath } from "./app/useCurrentPath";
import { navigate, roleHomePath } from "./app/routes";
import { theme } from "./app/theme";
import { useAuthStore } from "./features/auth/store";
import { LoadingPage } from "./pages/LoadingPage";
import { isRolePathAllowed } from "./app/routes";

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const RoleShell = lazy(() => import("./pages/RoleShell").then((module) => ({ default: module.RoleShell })));
const UnauthorizedPage = lazy(() =>
  import("./pages/UnauthorizedPage").then((module) => ({ default: module.UnauthorizedPage })),
);

export function App() {
  const path = useCurrentPath();
  const { bootstrap, status, user } = useAuthStore();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === "authenticated" && user && (path === "/" || path === "/login")) {
      navigate(roleHomePath[user.role]);
    }
  }, [path, status, user]);

  let content = <LoadingPage />;

  if (status === "anonymous") {
    content = <LoginPage />;
  }

  if (status === "authenticated" && user) {
    if (path === "/" || path === "/login") {
      content = <LoadingPage />;
    } else if (isRolePathAllowed(user.role, path)) {
      content = <RoleShell path={path} user={user} />;
    } else {
      content = <UnauthorizedPage currentRole={user.role} path={path} />;
    }
  }

  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <Suspense fallback={<LoadingPage />}>{content}</Suspense>
      </AntApp>
    </ConfigProvider>
  );
}
