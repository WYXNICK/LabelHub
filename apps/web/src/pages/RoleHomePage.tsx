import {
  ApiOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Alert, Card, Descriptions, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { getHealth } from "../features/auth/api";
import type { UserVO } from "../features/auth/types";
import { formatTaskTime } from "../features/tasks/view";
import type { HealthVO } from "../shared/types/api";

interface RoleHomePageProps {
  user: UserVO;
  path: string;
}

const roleCapabilities = {
  OWNER: ["任务管理", "数据集管理", "模板工作台", "审核配置", "导出中心"],
  LABELER: ["任务广场", "题目领取", "在线作答", "草稿保存", "返修处理"],
  REVIEWER: ["AI 预审队列", "人工审核", "多轮流转", "审核结果", "审计追踪"],
  SYSTEM: ["AI 任务处理", "OpenAI 兼容调用", "结构化输出校验"],
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
      <div>
        <Typography.Title level={2} style={{ marginBottom: 8 }}>
          工作台概览
        </Typography.Title>
        <Typography.Text type="secondary">
          当前角色：{user.name}。这里汇总当前角色的核心能力、服务状态和主要业务入口。
        </Typography.Text>
      </div>

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
            <Typography.Text strong>安全登录</Typography.Text>
            <Typography.Text type="secondary">
              HttpOnly Cookie Session 已启用，角色权限按工作台隔离。
            </Typography.Text>
            <Tag color="green">运行正常</Tag>
          </Space>
        </Card>

        <Card>
          <Space direction="vertical" size={12}>
            <ApiOutlined style={{ color: "#3370ff", fontSize: 24 }} />
            <Typography.Text strong>接口状态</Typography.Text>
            <Typography.Text type="secondary">
              前后端通过统一 API 返回结构协作，异常会以清晰错误提示呈现。
            </Typography.Text>
            <Tag color="green">已连接</Tag>
          </Space>
        </Card>

        <Card>
          <Space direction="vertical" size={12}>
            <DatabaseOutlined style={{ color: "#3370ff", fontSize: 24 }} />
            <Typography.Text strong>数据存储</Typography.Text>
            <Typography.Text type="secondary">
              MySQL 与 Alembic 迁移负责保存任务、数据集、模板、审核与导出记录。
            </Typography.Text>
            <Tag color="blue">已接入</Tag>
          </Space>
        </Card>

        <Card>
          <Space direction="vertical" size={12}>
            <ClockCircleOutlined style={{ color: "#ff8800", fontSize: 24 }} />
            <Typography.Text strong>业务入口</Typography.Text>
            <Typography.Text type="secondary">
              请选择左侧导航进入任务、模板、标注或审核工作台。
            </Typography.Text>
            <Tag>可用</Tag>
          </Space>
        </Card>
      </div>

      <Card title="服务健康检查">
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
            <Descriptions.Item label="当前页面">{path}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">等待后端响应...</Typography.Text>
        )}
      </Card>

      <Card title="当前角色能力">
        <Space wrap>
          {roleCapabilities[user.role].map((module) => (
            <Tag key={module} color="blue">
              {module}
            </Tag>
          ))}
        </Space>
      </Card>
    </Space>
  );
}
