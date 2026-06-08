import {
  ApiOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Flex, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { getHealth } from "../features/auth/api";
import type { UserVO } from "../features/auth/types";
import { formatTaskTime } from "../features/tasks/view";
import type { HealthVO } from "../shared/types/api";

interface RoleHomePageProps {
  user: UserVO;
  path: string;
}

const upcomingModules = {
  OWNER: ["任务 CRUD", "数据导入", "模板搭建", "审核配置", "导出中心"],
  LABELER: ["任务广场", "领取题目", "标注工作台", "草稿保存", "返修入口"],
  REVIEWER: ["待审列表", "审核详情", "AI 评语", "批量操作", "关键流转"],
  SYSTEM: ["AI Job", "OpenAI API 格式调用", "结构化输出校验"],
};

export function RoleHomePage({ user, path }: RoleHomePageProps) {
  const [health, setHealth] = useState<HealthVO | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then((data) => {
        setHealth(data);
        setHealthError(null);
      })
      .catch((error: unknown) => {
        setHealth(null);
        setHealthError(error instanceof Error ? error.message : "无法连接后端 API");
      });
  }, []);

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 8 }}>
            阶段 0 契约与工程底座
          </Typography.Title>
          <Typography.Text type="secondary">
            当前角色：{user.name}。此页面用于验证登录状态、角色入口、API Client、OpenAPI 和通用契约。
          </Typography.Text>
        </div>
        <Tag color="processing">SDD Contract Aligned</Tag>
      </Flex>

      {healthError && (
        <Alert
          showIcon
          type="warning"
          message="后端健康检查暂不可用"
          description={healthError}
        />
      )}

      <div className="labelhub-card-grid">
        <Card>
          <Space direction="vertical" size={12}>
            <SafetyCertificateOutlined style={{ color: "#3370ff", fontSize: 24 }} />
            <Typography.Text strong>鉴权与角色</Typography.Text>
            <Typography.Text type="secondary">
              HttpOnly Cookie Session 已接入，前端不保存 Token。
            </Typography.Text>
            <Tag color="green">已完成</Tag>
          </Space>
        </Card>

        <Card>
          <Space direction="vertical" size={12}>
            <ApiOutlined style={{ color: "#3370ff", fontSize: 24 }} />
            <Typography.Text strong>API 契约</Typography.Text>
            <Typography.Text type="secondary">
              `HealthVO`、`UserVO`、`LoginRequest`、错误结构已与后端 SDD 对齐。
            </Typography.Text>
            <Tag color="green">已完成</Tag>
          </Space>
        </Card>

        <Card>
          <Space direction="vertical" size={12}>
            <DatabaseOutlined style={{ color: "#3370ff", fontSize: 24 }} />
            <Typography.Text strong>数据库迁移</Typography.Text>
            <Typography.Text type="secondary">
              后端已建立 Alembic 迁移骨架，首个迁移覆盖 users 表。
            </Typography.Text>
            <Tag color="blue">后端底座</Tag>
          </Space>
        </Card>

        <Card>
          <Space direction="vertical" size={12}>
            <ClockCircleOutlined style={{ color: "#ff8800", fontSize: 24 }} />
            <Typography.Text strong>后续阶段入口</Typography.Text>
            <Typography.Text type="secondary">
              当前页面只放置业务入口，占位模块会在阶段 1 起逐步启用。
            </Typography.Text>
            <Tag>阶段 1+</Tag>
          </Space>
        </Card>
      </div>

      <Card title="后端健康检查">
        {health ? (
          <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="服务">{health.service}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag icon={<CheckCircleOutlined />} color="success">
                {health.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="版本">{health.version}</Descriptions.Item>
            <Descriptions.Item label="环境">{health.environment}</Descriptions.Item>
            <Descriptions.Item label="服务时间">{formatTaskTime(health.serverTime)}</Descriptions.Item>
            <Descriptions.Item label="当前路径">{path}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">等待后端响应...</Typography.Text>
        )}
      </Card>

      <Card title="本角色后续开发模块">
        <Space wrap>
          {upcomingModules[user.role].map((module) => (
            <Button key={module} disabled>
              {module}
            </Button>
          ))}
        </Space>
      </Card>
    </Space>
  );
}
