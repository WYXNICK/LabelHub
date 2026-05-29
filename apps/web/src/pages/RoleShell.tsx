import {
  AuditOutlined,
  BuildOutlined,
  DatabaseOutlined,
  FileDoneOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Flex, Layout, Menu, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";

import { navigate } from "../app/routes";
import { useAuthStore } from "../features/auth/store";
import type { UserRole, UserVO } from "../features/auth/types";
import { matchOwnerTaskDatasetsPath } from "../features/datasets/view";
import { matchOwnerTaskSettingsPath } from "../features/tasks/view";
import { OwnerTaskDatasetsPage } from "./OwnerTaskDatasetsPage";
import { OwnerTaskListPage } from "./OwnerTaskListPage";
import { OwnerTaskSettingsPage } from "./OwnerTaskSettingsPage";
import { RoleHomePage } from "./RoleHomePage";

const roleName: Record<UserRole, string> = {
  OWNER: "任务负责人",
  LABELER: "标注员",
  REVIEWER: "人工审核员",
  SYSTEM: "系统账号",
};

const menuItems: Record<Exclude<UserRole, "SYSTEM">, MenuProps["items"]> = {
  OWNER: [
    { key: "/owner/foundation", icon: <SafetyCertificateOutlined />, label: "阶段 0 底座" },
    { key: "/owner/tasks", icon: <DatabaseOutlined />, label: "任务管理" },
    { key: "/owner/contracts", icon: <BuildOutlined />, label: "契约中心" },
  ],
  LABELER: [
    { key: "/labeler/foundation", icon: <SafetyCertificateOutlined />, label: "阶段 0 底座" },
    { key: "/labeler/marketplace", icon: <DatabaseOutlined />, label: "任务广场" },
    { key: "/labeler/contributions", icon: <FileDoneOutlined />, label: "我的贡献" },
  ],
  REVIEWER: [
    { key: "/reviewer/foundation", icon: <SafetyCertificateOutlined />, label: "阶段 0 底座" },
    { key: "/reviewer/reviews", icon: <AuditOutlined />, label: "审核工作台" },
    { key: "/reviewer/results", icon: <FileDoneOutlined />, label: "审核结果" },
  ],
};

interface RoleShellProps {
  user: UserVO;
  path: string;
}

export function RoleShell({ user, path }: RoleShellProps) {
  const logout = useAuthStore((state) => state.logout);
  const role = user.role === "SYSTEM" ? "OWNER" : user.role;
  const selectedMenuKey = path.startsWith("/owner/tasks") ? "/owner/tasks" : path;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider width={248} breakpoint="lg" collapsedWidth={0}>
        <Flex vertical style={{ height: "100%", padding: 16 }}>
          <Space style={{ padding: "8px 8px 24px" }}>
            <span className="labelhub-shell-logo">L</span>
            <div>
              <Typography.Text strong style={{ color: "#1f2329" }}>
                LabelHub
              </Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                企业工作空间
              </Typography.Text>
            </div>
          </Space>
          <Menu
            mode="inline"
            selectedKeys={[selectedMenuKey]}
            items={menuItems[role]}
            onClick={({ key }) => navigate(key)}
            style={{ borderInlineEnd: 0, flex: 1 }}
          />
        </Flex>
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ height: 56, borderBottom: "1px solid #eff0f1", padding: "0 24px" }}>
          <Flex align="center" justify="space-between" style={{ height: "100%" }}>
            <Space size={12}>
              <Typography.Text strong>{roleName[user.role]}</Typography.Text>
              <Tag color="blue">{user.role}</Tag>
              <span className="labelhub-route-chip">{path}</span>
            </Space>
            <Space>
              <UserOutlined />
              <Typography.Text>{user.name}</Typography.Text>
              <Button icon={<LogoutOutlined />} onClick={() => void handleLogout()}>
                退出
              </Button>
            </Space>
          </Flex>
        </Layout.Header>
        <Layout.Content className="labelhub-page">
          {renderRoleContent(user, path)}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

function renderRoleContent(user: UserVO, path: string) {
  if (user.role === "OWNER") {
    if (path === "/owner/tasks") {
      return <OwnerTaskListPage />;
    }
    if (path === "/owner/tasks/new") {
      return <OwnerTaskSettingsPage />;
    }
    const taskDatasetsId = matchOwnerTaskDatasetsPath(path);
    if (taskDatasetsId) {
      return <OwnerTaskDatasetsPage taskId={taskDatasetsId} />;
    }
    const taskId = matchOwnerTaskSettingsPath(path);
    if (taskId) {
      return <OwnerTaskSettingsPage taskId={taskId} />;
    }
  }
  return <RoleHomePage path={path} user={user} />;
}
