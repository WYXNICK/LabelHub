import {
  CheckCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useState } from "react";

import { navigate } from "../app/routes";
import { ApiClientError } from "../shared/api/client";
import { getTask, listTasks, transitionTaskState } from "../features/tasks/api";
import type { TaskStatus, TaskVO } from "../features/tasks/types";
import {
  formatTaskTime,
  getTaskTransitionActions,
  taskStatusMeta,
} from "../features/tasks/view";
import type { PaginationVO } from "../shared/types/api";

const statusOptions = [
  { label: "全部状态", value: "ALL" },
  { label: "草稿", value: "DRAFT" },
  { label: "发布中", value: "PUBLISHED" },
  { label: "已暂停", value: "PAUSED" },
  { label: "已结束", value: "ENDED" },
];

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.payload?.error.message ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function getPublishBlockerText(error: ApiClientError): string | null {
  const details = error.payload?.error.details;
  if (!details || typeof details !== "object" || !("blockers" in details)) {
    return null;
  }
  const blockers = (details as { blockers?: Array<{ message?: string }> }).blockers ?? [];
  return blockers.map((blocker) => blocker.message).filter(Boolean).join("\n");
}

export function OwnerTaskListPage() {
  const { modal, message } = AntdApp.useApp();
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
        setError(getErrorMessage(requestError));
      } finally {
        setLoading(false);
      }
    },
    [submittedKeyword, submittedStatus],
  );

  const [queryState, setQueryState] = useState({ page: 1, pageSize: 10, requestId: 0 });

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

  function handleTransition(task: TaskVO, targetStatus: TaskStatus, label: string) {
    modal.confirm({
      title: `确认${label}任务？`,
      icon: <ExclamationCircleOutlined />,
      content: `任务「${task.title}」当前状态为 ${taskStatusMeta[task.status].label}。`,
      okText: label,
      okButtonProps: { danger: targetStatus === "ENDED" },
      cancelText: "取消",
      async onOk() {
        try {
          const latestTask = await getTask(task.id);
          await transitionTaskState(task.id, {
            targetStatus,
            version: latestTask.version,
            reason: `${label}任务`,
          });
          message.success(`${label}成功`);
          reloadCurrentPage();
        } catch (requestError) {
          if (requestError instanceof ApiClientError && requestError.payload?.error.code === "PUBLISH_BLOCKED") {
            modal.warning({
              title: "暂不能发布",
              content: (
                <pre className="labelhub-blocker-list">
                  {getPublishBlockerText(requestError) ?? requestError.message}
                </pre>
              ),
            });
            return;
          }
          message.error(getErrorMessage(requestError));
        }
      },
    });
  }

  const columns: TableColumnsType<TaskVO> = [
      {
        title: "任务",
        dataIndex: "title",
        key: "title",
        minWidth: 260,
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
        title: "状态",
        dataIndex: "status",
        width: 110,
        render: (value: TaskStatus) => (
          <Tag color={taskStatusMeta[value].color}>{taskStatusMeta[value].label}</Tag>
        ),
      },
      {
        title: "数据摘要",
        key: "summary",
        width: 180,
        render: (_, task) => (
          <Space direction="vertical" size={2}>
            <Typography.Text>配额 {task.quota}</Typography.Text>
            <Typography.Text type="secondary">
              领取 {task.claimedCount} / 提交 {task.submittedCount} / 通过 {task.approvedCount}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "截止时间",
        dataIndex: "deadlineAt",
        width: 170,
        render: (value: string | null) => formatTaskTime(value),
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
        width: 250,
        render: (_, task) => (
          <Space wrap>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/owner/tasks/${task.id}/settings`)}
            >
              设置
            </Button>
            {getTaskTransitionActions(task).map((action) => (
              <Button
                key={action.targetStatus}
                size="small"
                danger={action.danger}
                onClick={() => handleTransition(task, action.targetStatus, action.label)}
              >
                {action.label}
              </Button>
            ))}
          </Space>
        ),
      },
    ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 8 }}>
            任务管理
          </Typography.Title>
          <Typography.Text type="secondary">
            管理 Owner 创建的标注任务，阶段 1.1 已接入任务 CRUD、状态机与审计写入。
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/owner/tasks/new")}>
          新建任务
        </Button>
      </Flex>

      <Card>
        <Flex justify="space-between" align="center" gap={12} wrap="wrap">
          <Space wrap>
            <Input
              id="owner-task-keyword"
              name="ownerTaskKeyword"
              aria-label="搜索任务标题或描述"
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索标题或描述"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={submitQuery}
              style={{ width: 260 }}
            />
            <Select
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
          scroll={{ x: 1180 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无任务，先创建一个草稿任务"
              />
            ),
          }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.totalItems,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个任务`,
            onChange: (page, pageSize) =>
              setQueryState((current) => ({
                page,
                pageSize,
                requestId: current.requestId + 1,
              })),
          }}
        />
      </Card>

      <Card className="labelhub-stage-note">
        <Space>
          <CheckCircleOutlined />
          <Typography.Text>
            发布动作已经接入后端保护：缺少数据集、模板版本或审核配置时会返回清晰阻塞项。
          </Typography.Text>
        </Space>
      </Card>
    </Space>
  );
}
