import {
  AuditOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Flex,
  Form,
  Grid,
  Input,
  Row,
  Space,
  Typography,
  message,
} from "antd";
import { useMemo, useState } from "react";

import { navigate, roleHomePath } from "../app/routes";
import { useAuthStore } from "../features/auth/store";
import type { DemoLoginProfile, LoginRequest } from "../features/auth/types";

const DEMO_PASSWORD = "labelhub123";

const demoProfiles: DemoLoginProfile[] = [
  {
    role: "OWNER",
    title: "任务负责人",
    description: "任务、数据集、模板、审核配置和导出管理",
    email: "owner@labelhub.dev",
  },
  {
    role: "LABELER",
    title: "标注员",
    description: "任务广场、在线作答、草稿保存和返修",
    email: "labeler@labelhub.dev",
  },
  {
    role: "REVIEWER",
    title: "人工审核员",
    description: "复审、终审、打回、通过和审计追踪",
    email: "reviewer@labelhub.dev",
  },
];

const roleIcon = {
  OWNER: <SafetyCertificateOutlined />,
  LABELER: <DatabaseOutlined />,
  REVIEWER: <AuditOutlined />,
};

export function LoginPage() {
  const [form] = Form.useForm<LoginRequest>();
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const status = useAuthStore((state) => state.status);
  const [selectedEmail, setSelectedEmail] = useState(demoProfiles[0].email);
  const screens = Grid.useBreakpoint();
  const [messageApi, contextHolder] = message.useMessage();

  const brandWidth = useMemo(() => (screens.lg ? 14 : 0), [screens.lg]);
  const formWidth = useMemo(() => (screens.lg ? 10 : 24), [screens.lg]);

  async function submit(values: LoginRequest) {
    const user = await login(values);
    messageApi.success(`已进入 ${user.name} 工作区`);
    navigate(roleHomePath[user.role]);
  }

  async function quickLogin(profile: DemoLoginProfile) {
    const values = { email: profile.email, password: DEMO_PASSWORD };
    setSelectedEmail(profile.email);
    form.setFieldsValue(values);
    await submit(values);
  }

  return (
    <Row className="labelhub-login">
      {contextHolder}
      {screens.lg && (
        <Col span={brandWidth} className="labelhub-brand-panel">
          <Flex
            vertical
            justify="space-between"
            style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: 48 }}
          >
            <Space size={12}>
              <span className="labelhub-shell-logo">L</span>
              <Typography.Title level={2} style={{ color: "#fff", margin: 0 }}>
                LabelHub
              </Typography.Title>
            </Space>
            <div style={{ maxWidth: 620 }}>
              <Typography.Title style={{ color: "#fff", marginBottom: 16 }}>
                数据生产、AI 预审与人工验收的一体化工作台
              </Typography.Title>
              <Typography.Paragraph style={{ color: "#dbe1ff", fontSize: 16 }}>
                阶段 0 已对齐角色入口、接口契约、错误结构和 OpenAPI，后续 Owner、Labeler、
                Reviewer 三条主链路都将在同一套契约上并行演进。
              </Typography.Paragraph>
            </div>
          </Flex>
        </Col>
      )}

      <Col span={formWidth}>
        <Flex align="center" justify="center" style={{ minHeight: "100vh", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 520 }}>
            <Space direction="vertical" size={8} style={{ marginBottom: 24 }}>
              <Space size={10}>
                {!screens.lg && <span className="labelhub-shell-logo">L</span>}
                <Typography.Title level={2} style={{ margin: 0 }}>
                  欢迎回来
                </Typography.Title>
              </Space>
              <Typography.Text type="secondary">
                使用阶段 0 demo 账号进入对应角色工作区。统一密码：{DEMO_PASSWORD}
              </Typography.Text>
            </Space>

            {error && <Alert showIcon type="error" message={error} style={{ marginBottom: 16 }} />}

            <Form
              form={form}
              layout="vertical"
              initialValues={{ email: selectedEmail, password: DEMO_PASSWORD }}
              onFinish={(values) => void submit(values)}
            >
              <Form.Item
                label="邮箱地址"
                name="email"
                rules={[{ required: true, message: "请输入邮箱地址" }, { type: "email" }]}
              >
                <Input size="large" placeholder="name@company.com" />
              </Form.Item>
              <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
                <Input.Password size="large" placeholder="请输入密码" />
              </Form.Item>
              <Button
                block
                size="large"
                type="primary"
                htmlType="submit"
                loading={status === "loading"}
              >
                登录
              </Button>
            </Form>

            <Divider>角色快速入口</Divider>
            <div className="labelhub-card-grid">
              {demoProfiles.map((profile) => (
                <Card
                  key={profile.role}
                  hoverable
                  size="small"
                  onClick={() => void quickLogin(profile)}
                  styles={{ body: { minHeight: 128 } }}
                >
                  <Space direction="vertical" size={8}>
                    <Button shape="circle" type="primary" icon={roleIcon[profile.role]} />
                    <Typography.Text strong>{profile.title}</Typography.Text>
                    <Typography.Text type="secondary">{profile.description}</Typography.Text>
                  </Space>
                </Card>
              ))}
            </div>

            <Alert
              type="info"
              showIcon
              icon={<ClusterOutlined />}
              message="阶段 0 范围"
              description="当前只交付认证、角色壳、通用契约、OpenAPI 和基础运行环境；业务页面将在阶段 1 起逐步接入。"
              style={{ marginTop: 24 }}
            />
          </div>
        </Flex>
      </Col>
    </Row>
  );
}
