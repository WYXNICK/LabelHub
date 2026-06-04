import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  FieldTimeOutlined,
  FileProtectOutlined,
  ProfileOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Drawer, Flex, List, Space, Spin, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { getPublishCheck, getTask, transitionTaskState } from "../features/tasks/api";
import type { PublishBlockerCode, PublishBlockerVO, PublishCheckVO, TaskDetailVO } from "../features/tasks/types";
import {
  formatTaskTime,
  isPublishCheckTargetStatus,
  publishBlockerMeta,
  sortPublishBlockers,
  taskStatusMeta,
} from "../features/tasks/view";
import { ApiClientError } from "../shared/api/client";

interface OwnerPublishCheckDrawerProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onPublished?: (task: TaskDetailVO) => void;
}

interface ReadinessRow {
  key: string;
  title: string;
  value: string;
  blocker?: PublishBlockerVO;
  icon: ReactNode;
}

const BLOCKER_MESSAGES: Partial<Record<PublishBlockerCode, string>> = {
  MISSING_DATASET: "先导入并确认至少一个可用数据集。",
  MISSING_TEMPLATE_VERSION: "进入模板搭建器，保存草稿并发布一个模板版本。",
  MISSING_REVIEW_CONFIG: "进入审核配置页，保存并发布审核配置版本。",
  INVALID_QUOTA: "回到任务设置页，将任务配额调整为大于 0。",
  INVALID_DEADLINE: "回到任务设置页，将截止时间调整到未来时间。",
  INVALID_TASK_STATUS: "只有草稿或已暂停任务可以执行发布检查后的发布动作。",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.payload?.error.message ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function findBlocker(blockers: PublishBlockerVO[], code: PublishBlockerCode) {
  return blockers.find((blocker) => blocker.code === code);
}

function buildReadinessRows(task: TaskDetailVO | null, blockers: PublishBlockerVO[]): ReadinessRow[] {
  return [
    {
      key: "status",
      title: "任务状态",
      value: task ? taskStatusMeta[task.status].label : "读取中",
      blocker: findBlocker(blockers, "INVALID_TASK_STATUS"),
      icon: <ProfileOutlined />,
    },
    {
      key: "quota",
      title: "配额",
      value: task ? `${task.quota} 条` : "读取中",
      blocker: findBlocker(blockers, "INVALID_QUOTA"),
      icon: <FileProtectOutlined />,
    },
    {
      key: "deadline",
      title: "截止时间",
      value: task ? formatTaskTime(task.deadlineAt) : "读取中",
      blocker: findBlocker(blockers, "INVALID_DEADLINE"),
      icon: <FieldTimeOutlined />,
    },
    {
      key: "dataset",
      title: "数据集",
      value: task ? `可用题目 ${task.stats.enabledItemCount} / 总题目 ${task.stats.itemCount}` : "读取中",
      blocker: findBlocker(blockers, "MISSING_DATASET"),
      icon: <DatabaseOutlined />,
    },
    {
      key: "template",
      title: "标注模板",
      value: task?.currentTemplateVersionId ? "已绑定模板版本" : "未发布模板版本",
      blocker: findBlocker(blockers, "MISSING_TEMPLATE_VERSION"),
      icon: <ProfileOutlined />,
    },
    {
      key: "review",
      title: "审核配置",
      value: task?.currentReviewConfigVersionId ? "已绑定审核配置版本" : "未发布审核配置版本",
      blocker: findBlocker(blockers, "MISSING_REVIEW_CONFIG"),
      icon: <AuditOutlined />,
    },
  ];
}

async function fetchPublishCheckSnapshot(taskId: string) {
  const [task, check] = await Promise.all([getTask(taskId), getPublishCheck(taskId)]);
  return { task, check };
}

export function OwnerPublishCheckDrawer({
  taskId,
  open,
  onClose,
  onPublished,
}: OwnerPublishCheckDrawerProps) {
  const { message } = AntdApp.useApp();
  const [task, setTask] = useState<TaskDetailVO | null>(null);
  const [check, setCheck] = useState<PublishCheckVO | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockers = useMemo(() => sortPublishBlockers(check?.blockers ?? []), [check]);
  const rows = useMemo(() => buildReadinessRows(task, blockers), [blockers, task]);
  const canPublish = Boolean(
    task && check?.canPublish && isPublishCheckTargetStatus(task.status) && !publishing,
  );

  async function loadCheck() {
    if (!taskId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextTask, nextCheck] = await Promise.all([getTask(taskId), getPublishCheck(taskId)]);
      setTask(nextTask);
      setCheck(nextCheck);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setTask(null);
      setCheck(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !taskId) {
      return;
    }
    let ignore = false;
    const loadInitialCheck = async () => {
      setLoading(true);
      setError(null);
      try {
        const snapshot = await fetchPublishCheckSnapshot(taskId);
        if (ignore) {
          return;
        }
        setTask(snapshot.task);
        setCheck(snapshot.check);
      } catch (requestError) {
        if (!ignore) {
          setError(getErrorMessage(requestError));
          setTask(null);
          setCheck(null);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    void loadInitialCheck();
    return () => {
      ignore = true;
    };
  }, [open, taskId]);

  async function handlePublish() {
    if (!taskId || !task || !check?.canPublish) {
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const latestTask = await getTask(taskId);
      const published = await transitionTaskState(taskId, {
        targetStatus: "PUBLISHED",
        version: latestTask.version,
        reason: latestTask.status === "PAUSED" ? "发布前检查通过，恢复发布" : "发布前检查通过",
      });
      setTask(published);
      message.success(published.status === "PUBLISHED" ? "任务已发布" : "状态已更新");
      onPublished?.(published);
      await loadCheck();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      await loadCheck();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Drawer
      title="发布前检查"
      open={open}
      width={520}
      onClose={onClose}
      extra={
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadCheck()}>
          刷新
        </Button>
      }
    >
      <Spin spinning={loading}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {error && <Alert type="error" showIcon message={error} />}

          {check && (
            <Alert
              type={check.canPublish ? "success" : "warning"}
              showIcon
              message={check.canPublish ? "发布条件已满足" : "发布条件尚未满足"}
              description={
                check.canPublish
                  ? "当前任务已具备进入发布状态的基础条件。"
                  : "请先处理下方阻塞项；模板、数据集和审核配置都必须绑定到当前任务后才能发布。"
              }
            />
          )}

          {task && (
            <Flex justify="space-between" align="center" gap={12} wrap="wrap" className="labelhub-publish-task-head">
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{task.title}</Typography.Text>
                <Typography.Text type="secondary">最近更新：{formatTaskTime(task.updatedAt)}</Typography.Text>
              </Space>
              <Tag color={taskStatusMeta[task.status].color}>{taskStatusMeta[task.status].label}</Tag>
            </Flex>
          )}

          <List
            itemLayout="vertical"
            dataSource={rows}
            renderItem={(row) => {
              const meta = row.blocker ? publishBlockerMeta[row.blocker.code] : null;
              return (
                <List.Item className={row.blocker ? "labelhub-publish-row-blocked" : "labelhub-publish-row-ready"}>
                  <Flex align="flex-start" justify="space-between" gap={12}>
                    <Space align="start">
                      <span className="labelhub-publish-row-icon">{row.icon}</span>
                      <Space direction="vertical" size={2}>
                        <Typography.Text strong>{row.title}</Typography.Text>
                        <Typography.Text type="secondary">{row.value}</Typography.Text>
                        {row.blocker && (
                          <Typography.Text type="secondary">
                            {BLOCKER_MESSAGES[row.blocker.code] ?? row.blocker.message}
                          </Typography.Text>
                        )}
                      </Space>
                    </Space>
                    {row.blocker ? (
                      <Tag color={meta?.color ?? "warning"}>{meta?.label ?? row.blocker.code}</Tag>
                    ) : (
                      <Tag color="success" icon={<CheckCircleOutlined />}>
                        已就绪
                      </Tag>
                    )}
                  </Flex>
                </List.Item>
              );
            }}
          />

          {blockers.length > 0 && (
            <div className="labelhub-publish-blocker-box">
              <Space direction="vertical" size={8}>
                <Typography.Text strong>
                  阻塞项明细
                </Typography.Text>
                {blockers.map((blocker) => (
                  <Space key={`${blocker.code}-${blocker.field ?? "task"}`} align="start">
                    <CloseCircleOutlined className="labelhub-publish-blocker-icon" />
                    <Typography.Text>{blocker.message}</Typography.Text>
                  </Space>
                ))}
              </Space>
            </div>
          )}

          <Flex justify="space-between" align="center" gap={12} wrap="wrap">
            <Typography.Text type="secondary">
              检查时间：{check ? formatTaskTime(check.checkedAt) : "尚未检查"}
            </Typography.Text>
            <Button type="primary" disabled={!canPublish} loading={publishing} onClick={() => void handlePublish()}>
              发布任务
            </Button>
          </Flex>
        </Space>
      </Spin>
    </Drawer>
  );
}
