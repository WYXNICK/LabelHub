import {
  AuditOutlined,
  DatabaseOutlined,
  EditOutlined,
  FormOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Input, Select, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { listTasks } from "../features/tasks/api";
import type { TaskStatus, TaskVO } from "../features/tasks/types";
import { formatTaskTime, taskStatusMeta } from "../features/tasks/view";
import type { PaginationVO } from "../shared/types/api";

const statusOptions = [
  { label: "全部状态", value: "ALL" },
  { label: "草稿", value: "DRAFT" },
  { label: "发布中", value: "PUBLISHED" },
  { label: "已暂停", value: "PAUSED" },
  { label: "已结束", value: "ENDED" },
];

function getTemplateWorkMode(task: TaskVO): { label: string; color: string; description: string } {
  if (task.status === "DRAFT") {
    return {
      label: "可编辑",
      color: "blue",
      description: "可继续搭建、校验并保存模板草稿",
    };
  }
  return {
    label: "只读",
    color: "default",
    description: "非草稿任务暂以只读方式查看模板",
  };
}

export function OwnerTemplateHubPage() {
  const [tasks, setTasks] = useState<TaskVO[]>([]);
  const [pagination, setPagination] = useState<PaginationVO>({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 0,
  });
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [status, setStatus] = useState<TaskStatus | "ALL">("ALL");
  const [submittedStatus, setSubmittedStatus] = useState<TaskStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryState, setQueryState] = useState({ page: 1, pageSize: 10, requestId: 0 });

  const draftCount = useMemo(() => tasks.filter((task) => task.status === "DRAFT").length, [tasks]);
  const editableCount = useMemo(() => tasks.filter((task) => getTemplateWorkMode(task).label === "可编辑").length, [tasks]);

  const fetchTasks = useCallback(
    async (page: number, pageSize: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await listTasks({
          page,
          pageSize,
          keyword: submittedKeyword.trim() || undefined,
          status: submittedStatus === "ALL" ? undefined : submittedStatus,
        });
        setTasks(response.data);
        setPagination(response.pagination);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "任务列表加载失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [submittedKeyword, submittedStatus],
  );

  useEffect(() => {
    const loadTasks = async () => {
      await fetchTasks(queryState.page, queryState.pageSize);
    };
    void loadTasks();
  }, [fetchTasks, queryState]);

  function submitQuery() {
    setSubmittedKeyword(keyword);
    setSubmittedStatus(status);
    setQueryState((current) => ({ page: 1, pageSize: current.pageSize, requestId: current.requestId + 1 }));
  }

  function reloadCurrentPage() {
    setQueryState((current) => ({ ...current, requestId: current.requestId + 1 }));
  }

  const columns: TableColumnsType<TaskVO> = [
    {
      title: "任务",
      dataIndex: "title",
      key: "title",
      render: (_, task) => (
        <Space direction="vertical" size={4}>
          <Typography.Text strong>{task.title}</Typography.Text>
          <Typography.Text type="secondary" className="labelhub-table-description">
            {task.description || "暂无描述"}
          </Typography.Text>
          <Space size={4} wrap>
            {task.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </Space>
        </Space>
      ),
    },
    {
      title: "任务状态",
      dataIndex: "status",
      width: 120,
      render: (value: TaskStatus) => <Tag color={taskStatusMeta[value].color}>{taskStatusMeta[value].label}</Tag>,
    },
    {
      title: "搭建模式",
      key: "workMode",
      width: 220,
      render: (_, task) => {
        const mode = getTemplateWorkMode(task);
        return (
          <Space direction="vertical" size={2}>
            <Tag color={mode.color}>{mode.label}</Tag>
            <Typography.Text type="secondary">{mode.description}</Typography.Text>
          </Space>
        );
      },
    },
    {
      title: "最近更新",
      dataIndex: "updatedAt",
      width: 170,
      render: (value: string) => formatTaskTime(value),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 260,
      render: (_, task) => (
        <Space size={8} className="labelhub-task-actions">
          <Button
            size="small"
            type="primary"
            icon={<FormOutlined />}
            onClick={() => navigate(`/owner/tasks/${task.id}/designer`)}
          >
            进入搭建
          </Button>
          <Button size="small" icon={<SettingOutlined />} onClick={() => navigate(`/owner/tasks/${task.id}/settings`)}>
            任务设置
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 8 }}>
            模板搭建
          </Typography.Title>
          <Typography.Text type="secondary">
            先选择任务，再进入 Designer 搭建标注页面；模板草稿、预览与版本发布都绑定到具体任务。
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<DatabaseOutlined />} onClick={() => navigate("/owner/tasks")}>
            返回任务管理
          </Button>
          <Button type="primary" icon={<EditOutlined />} onClick={() => navigate("/owner/tasks/new")}>
            新建任务
          </Button>
        </Space>
      </Flex>

      <div className="labelhub-template-hub-summary">
        <Card>
          <Typography.Text type="secondary">当前页任务</Typography.Text>
          <Typography.Title level={3}>{tasks.length}</Typography.Title>
        </Card>
        <Card>
          <Typography.Text type="secondary">草稿任务</Typography.Text>
          <Typography.Title level={3}>{draftCount}</Typography.Title>
        </Card>
        <Card>
          <Typography.Text type="secondary">可编辑模板</Typography.Text>
          <Typography.Title level={3}>{editableCount}</Typography.Title>
        </Card>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<AuditOutlined />}
        message="为什么模板搭建仍然绑定任务？"
        description="官方链路要求任务发布前必须绑定可运行模板版本；模板 schema 还会影响数据集预览、Labeler 作答、AI 辅助和导出字段。因此左侧入口负责集中发现，具体搭建仍在任务上下文中完成。"
      />

      <Card>
        <Flex justify="space-between" align="center" gap={12} wrap="wrap">
          <Space wrap>
            <Input
              id="owner-template-keyword"
              name="ownerTemplateKeyword"
              aria-label="搜索任务标题或描述"
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索任务标题或描述"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={submitQuery}
              style={{ width: 260 }}
            />
            <Select
              aria-label="任务状态"
              value={status}
              options={statusOptions}
              onChange={(nextStatus) => setStatus(nextStatus)}
              style={{ width: 140 }}
            />
            <Button onClick={submitQuery}>查询</Button>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={reloadCurrentPage}>
            刷新
          </Button>
        </Flex>
      </Card>

      {error && (
        <Card className="labelhub-error-card">
          <Typography.Text type="danger">{error}</Typography.Text>
        </Card>
      )}

      <Card className="labelhub-table-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={tasks}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务，请先创建任务" /> }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.totalItems,
            showSizeChanger: true,
            onChange: (page, pageSize) => setQueryState({ page, pageSize, requestId: queryState.requestId + 1 }),
          }}
          scroll={{ x: 920 }}
        />
      </Card>
    </Space>
  );
}
