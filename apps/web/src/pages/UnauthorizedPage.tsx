import { Button, Result, Tag } from "antd";

import { navigate, roleHomePath } from "../app/routes";
import type { UserRole } from "../features/auth/types";

interface UnauthorizedPageProps {
  currentRole: UserRole;
  path: string;
}

export function UnauthorizedPage({ currentRole, path }: UnauthorizedPageProps) {
  return (
    <Result
      status="403"
      title="无权限访问该工作区"
      subTitle={
        <>
          当前角色 <Tag color="blue">{currentRole}</Tag> 不能访问 <span className="labelhub-route-chip">{path}</span>
        </>
      }
      extra={
        <Button type="primary" onClick={() => navigate(roleHomePath[currentRole])}>
          回到我的角色首页
        </Button>
      }
    />
  );
}
