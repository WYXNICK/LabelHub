import {
  AuditOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FieldTimeOutlined,
  FileSearchOutlined,
  LineChartOutlined,
  LoginOutlined,
  NodeIndexOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Badge,
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
  Statistic,
  Tag,
  Tooltip,
  Typography,
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

const roleAccent = {
  OWNER: "owner",
  LABELER: "labeler",
  REVIEWER: "reviewer",
};

const workflowItems = [
  { title: "任务配置", icon: <DeploymentUnitOutlined /> },
  { title: "数据导入", icon: <DatabaseOutlined /> },
  { title: "AI 初筛", icon: <ThunderboltOutlined /> },
  { title: "人工复核", icon: <FileSearchOutlined /> },
  { title: "结果导出", icon: <LineChartOutlined /> },
];

const signalCards = [
  { label: "今日提交", value: "1,284", suffix: "条", tone: "blue" },
  { label: "AI 初筛通过", value: "96.8", suffix: "%", tone: "violet" },
  { label: "待人工复核", value: "42", suffix: "条", tone: "orange" },
];

const recentActivities = [
  { label: "qa_quality 数据集导入完成", time: "2 分钟前", status: "success" },
  { label: "偏好对比任务已进入 AI 初筛", time: "7 分钟前", status: "processing" },
  { label: "返修样本已回到标注员工作台", time: "18 分钟前", status: "warning" },
];

export function LoginPage() {
  const [form] = Form.useForm<LoginRequest>();
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const status = useAuthStore((state) => state.status);
  const [selectedEmail, setSelectedEmail] = useState(demoProfiles[0].email);
  const screens = Grid.useBreakpoint();

  const brandWidth = useMemo(() => (screens.lg ? 14 : 0), [screens.lg]);
  const formWidth = useMemo(() => (screens.lg ? 10 : 24), [screens.lg]);

  async function submit(values: LoginRequest) {
    const user = await login(values);
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
      {screens.lg && (
        <Col span={brandWidth} className="labelhub-brand-panel">
          <Flex
            vertical
            justify="space-between"
            className="labelhub-brand-content"
          >
            <BrandHeader />
            <BrandDashboard />
            <BrandFooter />
          </Flex>
        </Col>
      )}

      <Col span={formWidth}>
        <Flex align="center" justify="center" className="labelhub-login-side">
          <div className="labelhub-login-card">
            <Space direction="vertical" size={8} className="labelhub-login-heading">
              <Space size={10}>
                {!screens.lg && <span className="labelhub-shell-logo">L</span>}
                <Typography.Title level={2} className="labelhub-login-title">
                  欢迎回来
                </Typography.Title>
              </Space>
              <Typography.Text type="secondary">
                进入 LabelHub 阶段 0 工作区，验证角色入口、接口契约与运行底座。
              </Typography.Text>
            </Space>

            <div className="labelhub-demo-strip">
              <Space size={8}>
                <CheckCircleOutlined />
                <Typography.Text strong>Demo 环境</Typography.Text>
              </Space>
              <Typography.Text type="secondary">
                统一密码 <Typography.Text code>{DEMO_PASSWORD}</Typography.Text>
              </Typography.Text>
            </div>

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
                icon={<LoginOutlined />}
                loading={status === "loading"}
                className="labelhub-login-button"
              >
                登录
              </Button>
            </Form>

            <Divider className="labelhub-login-divider">角色快速入口</Divider>
            <div className="labelhub-role-grid">
              {demoProfiles.map((profile) => (
                <Card
                  key={profile.role}
                  hoverable
                  size="small"
                  className={`labelhub-role-card labelhub-role-card-${roleAccent[profile.role]}`}
                  onClick={() => void quickLogin(profile)}
                >
                  <Flex justify="space-between" align="flex-start" gap={12}>
                    <Space direction="vertical" size={6}>
                      <span className="labelhub-role-icon">{roleIcon[profile.role]}</span>
                      <Typography.Text strong>{profile.title}</Typography.Text>
                      <Typography.Text type="secondary">{profile.description}</Typography.Text>
                    </Space>
                    <Tooltip title={profile.email}>
                      <Tag color="blue">Demo</Tag>
                    </Tooltip>
                  </Flex>
                </Card>
              ))}
            </div>

            <Alert
              type="info"
              showIcon
              icon={<ClusterOutlined />}
              message="阶段 0 范围"
              description="当前只交付认证、角色壳、通用契约、OpenAPI 和基础运行环境；业务页面将在阶段 1 起逐步接入。"
              className="labelhub-stage-alert"
            />
          </div>
        </Flex>
      </Col>
    </Row>
  );
}

function BrandHeader() {
  return (
    <Flex justify="space-between" align="center" className="labelhub-brand-header">
      <Space size={12}>
        <span className="labelhub-shell-logo labelhub-brand-logo">L</span>
        <div>
          <Typography.Title level={2} className="labelhub-brand-name">
            LabelHub
          </Typography.Title>
          <Typography.Text className="labelhub-brand-subtitle">AI Data Operation Platform</Typography.Text>
        </div>
      </Space>
      <Tag className="labelhub-brand-tag">Stage 0</Tag>
    </Flex>
  );
}

function BrandDashboard() {
  return (
    <div className="labelhub-showcase">
      <div className="labelhub-showcase-copy">
        <Tag className="labelhub-showcase-kicker" icon={<NodeIndexOutlined />}>
          阶段 0 生产底座
        </Tag>
        <Typography.Title className="labelhub-showcase-title">
          <span>数据流转清晰</span>
          <span>复核协作可追踪</span>
        </Typography.Title>
        <Typography.Paragraph className="labelhub-showcase-description">
          从导入、分配、AI 初筛到人工复核，每一步都有状态、责任人和记录。阶段 0
          先把登录、角色入口和接口返回规范打稳，后续业务页可以直接接入。
        </Typography.Paragraph>
      </div>

      <div className="labelhub-board-stage">
        <div className="labelhub-board-rail" aria-hidden="true">
          <span>Import</span>
          <span>Review</span>
          <span>Export</span>
        </div>
        <div className="labelhub-ops-board">
          <div className="labelhub-ops-board-inner">
            <div className="labelhub-board-toolbar">
              <Space>
                <NodeIndexOutlined />
                <Typography.Text strong>今日生产概览</Typography.Text>
              </Space>
              <Badge status="processing" text="运行正常" />
            </div>

            <ol className="labelhub-workflow-strip" aria-label="数据生产流程">
              {workflowItems.map((item, index) => (
                <li
                  key={item.title}
                  className={index <= 3 ? "labelhub-workflow-step-active" : undefined}
                  aria-current={index === 3 ? "step" : undefined}
                >
                  <span className="labelhub-workflow-icon">{item.icon}</span>
                  <span className="labelhub-workflow-title">{item.title}</span>
                </li>
              ))}
            </ol>

            <div className="labelhub-signal-grid">
              {signalCards.map((item) => (
                <div key={item.label} className={`labelhub-signal-card labelhub-signal-${item.tone}`}>
                  <Typography.Text className="labelhub-signal-label">{item.label}</Typography.Text>
                  <Statistic value={item.value} suffix={item.suffix} />
                </div>
              ))}
            </div>

            <div className="labelhub-activity-panel">
              <Flex justify="space-between" align="center" className="labelhub-activity-title">
                <Typography.Text strong>最近流转</Typography.Text>
                <FieldTimeOutlined />
              </Flex>
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                {recentActivities.map((activity) => (
                  <Flex key={activity.label} justify="space-between" align="center" gap={12}>
                    <Space size={8}>
                      <Badge status={activity.status as "success" | "processing" | "warning"} />
                      <Typography.Text>{activity.label}</Typography.Text>
                    </Space>
                    <Typography.Text type="secondary" className="labelhub-activity-time">
                      {activity.time}
                    </Typography.Text>
                  </Flex>
                ))}
              </Space>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandFooter() {
  return (
    <Flex justify="space-between" align="center" className="labelhub-brand-footer">
      <Space split={<span className="labelhub-footer-dot" />}>
        <Typography.Text>OpenAPI</Typography.Text>
        <Typography.Text>Cookie Session</Typography.Text>
        <Typography.Text>Alembic Ready</Typography.Text>
      </Space>
      <Typography.Text>Phase 0 foundation ready</Typography.Text>
    </Flex>
  );
}
