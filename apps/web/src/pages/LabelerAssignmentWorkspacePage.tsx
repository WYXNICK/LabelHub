import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  FieldTimeOutlined,
  FileDoneOutlined,
  LeftOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { navigate } from "../app/routes";
import { claimAssignment, getAssignmentContext, listAssignments, saveAssignmentDraft } from "../features/assignments/api";
import type { AssignmentContextVO, AssignmentVO } from "../features/assignments/types";
import {
  assignmentStatusMeta,
  buildClaimIdempotencyKey,
  buildLabelerAssignmentPath,
  draftSaveStatusMeta,
  formatAssignmentQueueLabel,
  getAssignmentProgressText,
  resolveAssignmentInitialValue,
  summarizeAssignmentQueue,
  type DraftSaveStatus,
} from "../features/assignments/view";
import { TemplateRenderer } from "../features/templates/TemplateRenderer";
import type { TemplateSubmissionValue } from "../features/templates/types";
import { formatTaskTime } from "../features/tasks/view";
import { ApiClientError } from "../shared/api/client";

interface LabelerAssignmentWorkspacePageProps {
  assignmentId: string;
}

const DRAFT_AUTOSAVE_DELAY_MS = 1000;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.payload?.error.message ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function getErrorCode(error: unknown): string | null {
  return error instanceof ApiClientError ? error.payload?.error.code ?? null : null;
}

function serializeDraftValue(value: TemplateSubmissionValue): string {
  return JSON.stringify(value);
}

function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "{}";
  }
}

function sortByClaimedAt(assignments: AssignmentVO[]): AssignmentVO[] {
  return [...assignments].sort((left, right) => {
    const leftTime = new Date(left.claimedAt).getTime();
    const rightTime = new Date(right.claimedAt).getTime();
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });
}

export function LabelerAssignmentWorkspacePage({ assignmentId }: LabelerAssignmentWorkspacePageProps) {
  const { message } = AntdApp.useApp();
  const [context, setContext] = useState<AssignmentContextVO | null>(null);
  const [value, setValue] = useState<TemplateSubmissionValue>({});
  const [jumpAssignments, setJumpAssignments] = useState<AssignmentVO[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingNext, setClaimingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftSaveStatus>("idle");
  const [draftError, setDraftError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const lastSavedDraftRef = useRef("");
  const lastFailedDraftRef = useRef("");
  const queueSummary = useMemo(() => summarizeAssignmentQueue(jumpAssignments), [jumpAssignments]);

  const clearDraftTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const loadJumpCandidates = useCallback(async (taskId: string) => {
    const response = await listAssignments({ page: 1, pageSize: 100 });
    const candidates = response.data.filter((item) => item.taskId === taskId && item.status !== "CANCELLED");
    setJumpAssignments(sortByClaimedAt(candidates));
  }, []);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextContext = await getAssignmentContext(assignmentId);
      const initialValue = resolveAssignmentInitialValue(nextContext);
      setContext(nextContext);
      setValue(initialValue);
      lastSavedDraftRef.current = serializeDraftValue(initialValue);
      lastFailedDraftRef.current = "";
      setDraftStatus(nextContext.assignment.draftSavedAt ? "saved" : "idle");
      setDraftError(null);
      await loadJumpCandidates(nextContext.task.id);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setContext(null);
      setJumpAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, loadJumpCandidates]);

  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  useEffect(() => clearDraftTimer, [clearDraftTimer]);

  const persistDraft = useCallback(
    async (nextValue: TemplateSubmissionValue, source: "auto" | "manual") => {
      if (!context || saveInFlightRef.current) {
        return;
      }
      saveInFlightRef.current = true;
      clearDraftTimer();
      setDraftStatus("saving");
      setDraftError(null);
      try {
        const savedAssignment = await saveAssignmentDraft(context.assignment.id, {
          values: nextValue,
          clientVersion: context.assignment.version,
        });
        setContext((current) =>
          current?.assignment.id === savedAssignment.id
            ? { ...current, assignment: savedAssignment }
            : current,
        );
        lastSavedDraftRef.current = serializeDraftValue(savedAssignment.draftValues ?? nextValue);
        lastFailedDraftRef.current = "";
        setDraftStatus("saved");
        if (source === "manual") {
          message.success("草稿已保存");
        }
      } catch (requestError) {
        const isConflict = getErrorCode(requestError) === "ASSIGNMENT_VERSION_CONFLICT";
        lastFailedDraftRef.current = serializeDraftValue(nextValue);
        setDraftStatus(isConflict ? "conflict" : "error");
        setDraftError(getErrorMessage(requestError));
        if (source === "manual") {
          message.error(getErrorMessage(requestError));
        }
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [clearDraftTimer, context, message],
  );

  useEffect(() => {
    if (!context || draftStatus === "conflict" || draftStatus === "saving") {
      return;
    }
    const serializedValue = serializeDraftValue(value);
    if (serializedValue === lastSavedDraftRef.current) {
      return;
    }
    if (draftStatus === "error" && serializedValue === lastFailedDraftRef.current) {
      return;
    }
    setDraftStatus("dirty");
    setDraftError(null);
    clearDraftTimer();
    // 防抖保存避免每个按键都打到后端，同时保留底部显式保存入口。
    saveTimerRef.current = setTimeout(() => {
      void persistDraft(value, "auto");
    }, DRAFT_AUTOSAVE_DELAY_MS);
    return clearDraftTimer;
  }, [clearDraftTimer, context, draftStatus, persistDraft, value]);

  async function handleClaimNext() {
    if (!context?.navigation.nextClaimableTaskId) {
      return;
    }
    setClaimingNext(true);
    try {
      const assignment = await claimAssignment(context.navigation.nextClaimableTaskId, {
        idempotencyKey: buildClaimIdempotencyKey(context.navigation.nextClaimableTaskId),
      });
      message.success("已领取下一题");
      navigate(buildLabelerAssignmentPath(assignment.id));
    } catch (requestError) {
      message.error(getErrorMessage(requestError));
    } finally {
      setClaimingNext(false);
    }
  }

  function handleSaveDraftNow() {
    if (draftStatus === "conflict") {
      void fetchContext();
      return;
    }
    void persistDraft(value, "manual");
  }

  if (loading && !context) {
    return (
      <Card>
        <Spin tip="正在加载作答上下文...">
          <div className="labelhub-loading-block" />
        </Spin>
      </Card>
    );
  }

  if (error || !context) {
    return (
      <Card>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert type="error" showIcon message={error ?? "作答上下文不可用"} />
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/labeler/marketplace")}>
              返回任务广场
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchContext()}>
              重试
            </Button>
          </Space>
        </Space>
      </Card>
    );
  }

  const { assignment, navigation, task } = context;
  const statusMeta = assignmentStatusMeta[assignment.status];
  const draftMeta = draftSaveStatusMeta[draftStatus];
  const currentJumpValue = jumpAssignments.some((item) => item.id === assignment.id) ? assignment.id : undefined;
  const draftTimeText = assignment.draftSavedAt ? formatTaskTime(assignment.draftSavedAt) : "尚未保存";

  return (
    <div className="labelhub-assignment-workspace">
      <aside className="labelhub-assignment-rail">
        <Card
          title="题目导航"
          extra={<Tag color="blue">{getAssignmentProgressText(navigation)}</Tag>}
        >
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Select
              value={currentJumpValue}
              placeholder="跳转到已领取题目"
              options={jumpAssignments.map((item, index) => ({
                value: item.id,
                label: formatAssignmentQueueLabel(item, index),
              }))}
              onChange={(nextAssignmentId) => navigate(buildLabelerAssignmentPath(nextAssignmentId))}
              style={{ width: "100%" }}
            />
            <div className="labelhub-assignment-question-list">
              {jumpAssignments.map((item, index) => {
                const itemMeta = assignmentStatusMeta[item.status];
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="labelhub-assignment-question-item"
                    data-active={item.id === assignment.id}
                    onClick={() => navigate(buildLabelerAssignmentPath(item.id))}
                  >
                    <span>{formatAssignmentQueueLabel(item, index)}</span>
                    <Tag color={itemMeta.color}>{itemMeta.label}</Tag>
                  </button>
                );
              })}
              {jumpAssignments.length === 0 && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已领取题目" />
              )}
            </div>
          </Space>
        </Card>
      </aside>

      <main className="labelhub-assignment-center">
        <Card className="labelhub-assignment-toolbar">
          <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
            <div>
              <Space size={8} wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/labeler/marketplace")}>
                  返回任务广场
                </Button>
                <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                <Tag color={draftMeta.color}>{draftMeta.label}</Tag>
                <Tag color="blue">模板 {assignment.templateVersionId.slice(0, 18)}</Tag>
              </Space>
              <Typography.Title level={2} style={{ margin: "14px 0 6px" }}>
                {task.title} · 第 {navigation.currentIndex} 题
              </Typography.Title>
              <Typography.Text type="secondary">
                题目 ID {assignment.datasetItemId.slice(0, 18)} · 领取时间 {formatTaskTime(assignment.claimedAt)}
              </Typography.Text>
            </div>
            <Space wrap>
              <Tooltip title="阶段 3.5 接入题目异常报告">
                <Button disabled>报告题目</Button>
              </Tooltip>
              <Button
                type="primary"
                ghost
                icon={<ThunderboltOutlined />}
                loading={claimingNext}
                disabled={!navigation.canClaimNext}
                onClick={() => void handleClaimNext()}
              >
                领取下一题
              </Button>
            </Space>
          </Flex>
        </Card>

        <Card className="labelhub-assignment-main-card">
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Alert
              type={draftStatus === "error" || draftStatus === "conflict" ? "warning" : "info"}
              showIcon
              message={
                draftStatus === "saved"
                  ? `草稿已自动保存：${draftTimeText}`
                  : draftError ?? draftMeta.message
              }
              action={
                draftStatus === "error" || draftStatus === "conflict" ? (
                  <Button size="small" onClick={() => void handleSaveDraftNow()}>
                    {draftStatus === "conflict" ? "重新加载" : "重试保存"}
                  </Button>
                ) : null
              }
            />
            <TemplateRenderer
              schema={context.templateSchema}
              itemPayload={context.datasetItemPayload}
              value={value}
              onChange={setValue}
            />
          </Space>
        </Card>

        <Card className="labelhub-assignment-footer">
          <Flex align="center" justify="space-between" gap={12} wrap="wrap">
            <Space wrap>
              <Button
                icon={<LeftOutlined />}
                disabled={!navigation.previousAssignmentId}
                onClick={() => navigation.previousAssignmentId && navigate(buildLabelerAssignmentPath(navigation.previousAssignmentId))}
              >
                上一题
              </Button>
              <Button
                icon={<ArrowRightOutlined />}
                disabled={!navigation.nextAssignmentId}
                onClick={() => navigation.nextAssignmentId && navigate(buildLabelerAssignmentPath(navigation.nextAssignmentId))}
              >
                下一题
              </Button>
            </Space>
            <Space wrap>
              <Typography.Text type="secondary">
                {draftStatus === "saved" ? `上次保存：${draftTimeText}` : draftMeta.message}
              </Typography.Text>
              <Tooltip title={draftStatus === "conflict" ? "服务端已有更新，先重新加载避免覆盖他人草稿" : "立即保存当前草稿"}>
                <Button
                  icon={draftStatus === "conflict" ? <ReloadOutlined /> : <SaveOutlined />}
                  loading={draftStatus === "saving"}
                  onClick={() => void handleSaveDraftNow()}
                >
                  {draftStatus === "conflict" ? "重新加载题目" : "保存草稿"}
                </Button>
              </Tooltip>
              <Tooltip title="阶段 3.4 接入提交校验和提交版本">
                <Button type="primary" disabled>
                  提交本题
                </Button>
              </Tooltip>
            </Space>
          </Flex>
        </Card>
      </main>

      <aside className="labelhub-assignment-side">
        <Card title="我的贡献（本任务）">
          <div className="labelhub-assignment-mini-stats">
            <div>
              <FileDoneOutlined />
              <strong>{queueSummary.submittedCount}</strong>
              <span>已提交</span>
            </div>
            <div>
              <CheckCircleOutlined />
              <strong>{queueSummary.approvedCount}</strong>
              <span>通过</span>
            </div>
            <div>
              <FieldTimeOutlined />
              <strong>{queueSummary.returnedCount}</strong>
              <span>打回</span>
            </div>
          </div>
          <Typography.Text type="secondary">
            当前队列 {queueSummary.totalCount} 题，待处理 {queueSummary.activeCount} 题。
          </Typography.Text>
        </Card>

        <Card title="本题历史">
          <div className="labelhub-assignment-history">
            <div>
              <strong>领取题目</strong>
              <span>{formatTaskTime(assignment.claimedAt)}</span>
            </div>
            <div>
              <strong>{statusMeta.label}</strong>
              <span>当前状态</span>
            </div>
            {assignment.draftSavedAt && (
              <div>
                <strong>草稿保存</strong>
                <span>{formatTaskTime(assignment.draftSavedAt)}</span>
              </div>
            )}
            <div>
              <strong>{draftMeta.label}</strong>
              <span>{draftStatus === "saved" ? draftTimeText : draftMeta.message}</span>
            </div>
          </div>
        </Card>

        <Card title="任务上下文">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="任务">{task.title}</Descriptions.Item>
            <Descriptions.Item label="截止时间">{formatTaskTime(task.deadlineAt)}</Descriptions.Item>
            <Descriptions.Item label="模板版本">{assignment.templateVersionId}</Descriptions.Item>
            <Descriptions.Item label="审核配置">{assignment.reviewConfigVersionId}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          title={
            <Space>
              <DatabaseOutlined />
              原始数据
            </Space>
          }
        >
          {Object.keys(context.datasetItemPayload).length > 0 ? (
            <pre className="labelhub-assignment-payload">{formatPayload(context.datasetItemPayload)}</pre>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前题目没有原始 payload" />
          )}
        </Card>
      </aside>
    </div>
  );
}
