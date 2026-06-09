import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  FileProtectOutlined,
  FormOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Card,
  Dropdown,
  Empty,
  Flex,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useState } from "react";

import { navigate } from "../app/routes";
import { ApiClientError } from "../shared/api/client";
import { getTask, getTaskSummary, listTasks, transitionTaskState } from "../features/tasks/api";
import type { TaskStatus, TaskSummaryVO, TaskVO } from "../features/tasks/types";
import {
  formatTaskTime,
  getTaskTransitionActions,
  taskStatusMeta,
} from "../features/tasks/view";
import { buildOwnerTaskDesignerPath } from "../features/templates/view";
import type { PaginationVO } from "../shared/types/api";
import { OwnerPublishCheckDrawer } from "./OwnerPublishCheckDrawer";

const statusOptions = [
  { label: "全部状态", value: "ALL" },
  { label: "草稿", value: "DRAFT" },
  { label: "已发布", value: "PUBLISHED" },
  { label: "已暂停", value: "PAUSED" },
  { label: "已结束", value: "ENDED" },
];

const emptyTaskSummary: TaskSummaryVO = {
  totalTaskCount: 0,
  draftTaskCount: 0,
  publishedTaskCount: 0,
  pausedTaskCount: 0,
  endedTaskCount: 0,
  totalQuota: 0,
  totalClaimedCount: 0,
  totalSubmittedCount: 0,
  totalApprovedCount: 0,
  readyDatasetCount: 0,
  enabledItemCount: 0,
  templateReadyTaskCount: 0,
  reviewConfigReadyTaskCount: 0,
};

function formatMetric(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

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

type TaskActionMenuKey =
  | "review-config"
  | "template-preview"
  | "publish-check"
  | "acceptance"
  | "exports"
  | `transition:${TaskStatus}`;

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
  const [publishCheckTaskId, setPublishCheckTaskId] = useState<string | null>(null);
  const [summary, setSummary] = useState<TaskSummaryVO>(emptyTaskSummary);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
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

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      setSummary(await getTaskSummary());
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const [queryState, setQueryState] = useState({ page: 1, pageSize: 10, requestId: 0 });

  useEffect(() => {
    const loadTasks = async () => {
      await Promise.all([fetchTasks(queryState.page, queryState.pageSize), fetchSummary()]);
    };
    void loadTasks();
  }, [fetchSummary, fetchTasks, queryState]);

  function submitQuery() {
    setSubmittedKeyword(keyword);
    setSubmittedStatus(status);
    setQueryState((current) => ({ page: 1, pageSize: current.pageSize, requestId: current.requestId + 1 }));
  }

  function reloadCurrentPage() {
    setQueryState((current) => ({ ...current, requestId: current.requestId + 1 }));
  }

  function handleTransition(task: TaskVO, targetStatus: TaskStatus, label: string) {
    if (targetStatus === "PUBLISHED") {
      setPublishCheckTaskId(task.id);
      return;
    }
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

  function renderTaskActions(task: TaskVO) {
    const transitionActions = getTaskTransitionActions(task);
    const primaryTransition = transitionActions.find((action) => !action.danger);
    const secondaryTransitions = transitionActions.filter((action) => action !== primaryTransition);
    const menuItems: MenuProps["items"] = [
      {
        key: "template-preview",
        icon: <FormOutlined />,
        label: "搭建模板",
      },
      {
        key: "review-config",
        icon: <AuditOutlined />,
        label: "审核配置",
      },
      {
        key: "publish-check",
        icon: <FileProtectOutlined />,
        label: "发布检查",
      },
      {
        key: "acceptance",
        icon: <FileDoneOutlined />,
        label: "数据验收",
      },
      {
        key: "exports",
        icon: <DownloadOutlined />,
        label: "导出中心",
      },
    ];

    if (secondaryTransitions.length > 0) {
      menuItems.push({ type: "divider" });
      for (const action of secondaryTransitions) {
        menuItems.push({
          key: `transition:${action.targetStatus}`,
          danger: action.danger,
          icon: action.danger ? <CloseCircleOutlined /> : undefined,
          label: `${action.label}任务`,
        });
      }
    }

    const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
      const actionKey = key as TaskActionMenuKey;
      if (actionKey === "template-preview") {
        navigate(buildOwnerTaskDesignerPath(task.id, "tasks"));
        return;
      }
      if (actionKey === "review-config") {
        navigate(`/owner/tasks/${task.id}/review-config`);
        return;
      }
      if (actionKey === "publish-check") {
        setPublishCheckTaskId(task.id);
        return;
      }
      if (actionKey === "acceptance") {
        navigate(`/owner/tasks/${task.id}/acceptance`);
        return;
      }
      if (actionKey === "exports") {
        navigate(`/owner/tasks/${task.id}/exports`);
        return;
      }
      if (actionKey.startsWith("transition:")) {
        const targetStatus = actionKey.replace("transition:", "") as TaskStatus;
        const action = transitionActions.find((item) => item.targetStatus === targetStatus);
        if (action) {
          handleTransition(task, action.targetStatus, action.label);
        }
      }
    };

    return (
      <Space size={6} className="labelhub-task-actions">
        <Button
          size="small"
          type="link"
          icon={<EditOutlined />}
          onClick={() => navigate(`/owner/tasks/${task.id}/settings`)}
        >
          设置
        </Button>
        <Button
          size="small"
          type="link"
          icon={<DatabaseOutlined />}
          onClick={() => navigate(`/owner/tasks/${task.id}/datasets`)}
        >
          数据集
        </Button>
        {primaryTransition && (
          <Button
            size="small"
            type="link"
            onClick={() => handleTransition(task, primaryTransition.targetStatus, primaryTransition.label)}
          >
            {primaryTransition.label}
          </Button>
        )}
        <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={["click"]} placement="bottomRight">
          <Button size="small" icon={<MoreOutlined />}>
            更多
          </Button>
        </Dropdown>
      </Space>
    );
  }

  const columns: TableColumnsType<TaskVO> = [
      {
        title: "任务",
        dataIndex: "title",
        key: "title",
        width: 340,
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
        width: 255,
        render: (_, task) => renderTaskActions(task),
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
            集中管理标注任务的创建、状态流转、数据集、模板、审核配置与导出入口。
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/owner/tasks/new")}>
          新建任务
        </Button>
      </Flex>

      <div className="labelhub-task-summary-grid" aria-busy={summaryLoading}>
        <Card>
          <Typography.Text type="secondary">已发布任务</Typography.Text>
          <Typography.Title level={3}>{formatMetric(summary.publishedTaskCount)}</Typography.Title>
          <Typography.Text type="secondary">当前可进入标注市场的任务</Typography.Text>
        </Card>
        <Card>
          <Typography.Text type="secondary">草稿任务</Typography.Text>
          <Typography.Title level={3}>{formatMetric(summary.draftTaskCount)}</Typography.Title>
          <Typography.Text type="secondary">待补齐数据集、模板或审核配置</Typography.Text>
        </Card>
        <Card>
          <Typography.Text type="secondary">可用题目</Typography.Text>
          <Typography.Title level={3}>{formatMetric(summary.enabledItemCount)}</Typography.Title>
          <Typography.Text type="secondary">{formatMetric(summary.readyDatasetCount)} 个可用数据集</Typography.Text>
        </Card>
        <Card>
          <Typography.Text type="secondary">累计提交</Typography.Text>
          <Typography.Title level={3}>{formatMetric(summary.totalSubmittedCount)}</Typography.Title>
          <Typography.Text type="secondary">
            通过 {formatMetric(summary.totalApprovedCount)} / 领取 {formatMetric(summary.totalClaimedCount)}
          </Typography.Text>
        </Card>
      </div>

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

      <Card className="labelhub-system-note">
        <Space>
          <CheckCircleOutlined />
          <Typography.Text>
            发布前检查会校验数据集、模板版本和审核配置，并返回可处理的阻塞项。
          </Typography.Text>
        </Space>
      </Card>

      <OwnerPublishCheckDrawer
        taskId={publishCheckTaskId}
        open={Boolean(publishCheckTaskId)}
        onClose={() => setPublishCheckTaskId(null)}
        onPublished={reloadCurrentPage}
      />
    </Space>
  );
}
