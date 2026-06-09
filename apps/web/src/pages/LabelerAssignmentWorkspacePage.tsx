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
import {
  claimAssignment,
  createSubmission,
  getAssignmentContext,
  listAssignments,
  runLlmAction,
  saveAssignmentDraft,
} from "../features/assignments/api";
import type { AssignmentContextVO, AssignmentVO } from "../features/assignments/types";
import {
  assignmentStatusMeta,
  buildSubmissionIdempotencyKey,
  buildClaimIdempotencyKey,
  buildLabelerAssignmentPath,
  buildLabelerAssignmentRevisePath,
  buildLlmActionIdempotencyKey,
  draftSaveStatusMeta,
  formatAssignmentQueueLabel,
  getAssignmentProgressText,
  isAssignmentEditable,
  resolveAssignmentInitialValue,
  serializeAssignmentDraftValue,
  summarizeAssignmentQueue,
  type DraftSaveStatus,
} from "../features/assignments/view";
import { TemplateRenderer } from "../features/templates/TemplateRenderer";
import {
  pruneHiddenSubmissionValue,
  validateTemplateSubmissionValue,
  type TemplateSubmissionError,
} from "../features/templates/runtime";
import type { TemplateComponentDTO, TemplateSubmissionValue } from "../features/templates/types";
import { createFileObject } from "../features/files/api";
import { formatTaskTime } from "../features/tasks/view";
import { ApiClientError } from "../shared/api/client";

interface LabelerAssignmentWorkspacePageProps {
  assignmentId: string;
  mode?: "workspace" | "revise";
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

function getServerSubmissionErrors(error: unknown): TemplateSubmissionError[] {
  if (!(error instanceof ApiClientError)) {
    return [];
  }
  const details = error.payload?.error.details;
  if (!details || typeof details !== "object" || !Array.isArray((details as { errors?: unknown }).errors)) {
    return [];
  }
  return (details as { errors: unknown[] }).errors.flatMap((item): TemplateSubmissionError[] => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;
    return typeof record.fieldKey === "string" && typeof record.message === "string"
      ? [{ fieldKey: record.fieldKey, message: record.message }]
      : [];
  });
}

function serializeDraftValue(value: TemplateSubmissionValue): string {
  return serializeAssignmentDraftValue(value);
}

function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "{}";
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function buildEvidenceObjectKey(assignmentId: string, component: TemplateComponentDTO, file: File): string {
  const fieldKey = component.fieldKey ?? component.id;
  const safeName = file.name.replace(/[^\w.\u4e00-\u9fa5-]+/g, "_");
  return `evidence/${assignmentId}/${fieldKey}/${Date.now()}-${safeName}`;
}

function sortByClaimedAt(assignments: AssignmentVO[]): AssignmentVO[] {
  return [...assignments].sort((left, right) => {
    const leftTime = new Date(left.claimedAt).getTime();
    const rightTime = new Date(right.claimedAt).getTime();
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });
}

export function LabelerAssignmentWorkspacePage({ assignmentId, mode = "workspace" }: LabelerAssignmentWorkspacePageProps) {
  const { message } = AntdApp.useApp();
  const [context, setContext] = useState<AssignmentContextVO | null>(null);
  const [value, setValue] = useState<TemplateSubmissionValue>({});
  const [jumpAssignments, setJumpAssignments] = useState<AssignmentVO[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingNext, setClaimingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftSaveStatus>("idle");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<TemplateSubmissionError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const lastSavedDraftRef = useRef("");
  const lastFailedDraftRef = useRef("");
  const valueRef = useRef<TemplateSubmissionValue>({});
  const queueSummary = useMemo(() => summarizeAssignmentQueue(jumpAssignments), [jumpAssignments]);
  const localSubmitErrors = useMemo(() => {
    if (!context) {
      return [];
    }
    const cleanedValue = pruneHiddenSubmissionValue(context.templateSchema, value);
    return validateTemplateSubmissionValue(context.templateSchema, cleanedValue);
  }, [context, value]);
  const visibleSubmitErrors = submitErrors.length > 0 ? submitErrors : localSubmitErrors;
  const isReviseMode = mode === "revise";
  const backPath = isReviseMode ? "/labeler/contributions" : "/labeler/marketplace";
  const backLabel = isReviseMode ? "返回我的贡献" : "返回任务广场";
  const buildPeerPath = useCallback(
    (nextAssignmentId: string) =>
      isReviseMode ? buildLabelerAssignmentRevisePath(nextAssignmentId) : buildLabelerAssignmentPath(nextAssignmentId),
    [isReviseMode],
  );

  const clearDraftTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const handleValueChange = useCallback((nextValue: TemplateSubmissionValue) => {
    if (serializeDraftValue(valueRef.current) === serializeDraftValue(nextValue)) {
      return;
    }
    valueRef.current = nextValue;
    setValue(nextValue);
    setSubmitErrors([]);
    setSubmitError(null);
  }, []);

  const handleEvidenceFileUpload = useCallback(
    async (file: File, component: TemplateComponentDTO) => {
      try {
        if (!context) {
          throw new Error("作答上下文尚未加载");
        }
        const fileObject = await createFileObject({
          bucket: "labelhub-local",
          objectKey: buildEvidenceObjectKey(context.assignment.id, component, file),
          fileName: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
          checksum: null,
          purpose: "EVIDENCE",
          contentBase64: await readFileAsBase64(file),
        });
        message.success(`已上传 ${file.name}`);
        return fileObject.id;
      } catch (uploadError) {
        message.error(getErrorMessage(uploadError));
        throw uploadError;
      }
    },
    [context, message],
  );

  const handleRunTemplateLlmAction = useCallback(
    async (component: TemplateComponentDTO, inputValues: TemplateSubmissionValue) => {
      if (!context) {
        throw new Error("作答上下文尚未加载");
      }
      const targetFieldKey = typeof component.props.outputFieldKey === "string" ? component.props.outputFieldKey : null;
      const result = await runLlmAction(context.assignment.id, component.id, {
        inputValues,
        targetFieldKey,
        idempotencyKey: buildLlmActionIdempotencyKey(context.assignment.id, component.id),
      });
      if (result.status === "SUCCEEDED") {
        message.success(targetFieldKey ? `AI 建议已生成，可采纳到 ${targetFieldKey}` : "AI 建议已生成");
      } else {
        message.warning(result.errorMessage ?? "AI 辅助生成失败，请稍后重试。");
      }
      return result;
    },
    [context, message],
  );

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
      const initialValue = pruneHiddenSubmissionValue(
        nextContext.templateSchema,
        resolveAssignmentInitialValue(nextContext),
      );
      setContext(nextContext);
      valueRef.current = initialValue;
      setValue(initialValue);
      lastSavedDraftRef.current = serializeDraftValue(initialValue);
      lastFailedDraftRef.current = "";
      setDraftStatus(nextContext.assignment.draftSavedAt ? "saved" : "idle");
      setDraftError(null);
      setSubmitErrors([]);
      setSubmitError(null);
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

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => clearDraftTimer, [clearDraftTimer]);

  const persistDraft = useCallback(
    async (nextValue: TemplateSubmissionValue, source: "auto" | "manual") => {
      if (!context || !isAssignmentEditable(context.assignment.status) || saveInFlightRef.current) {
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
        const savedValue = pruneHiddenSubmissionValue(
          context.templateSchema,
          (savedAssignment.draftValues ?? nextValue) as TemplateSubmissionValue,
        );
        lastSavedDraftRef.current = serializeDraftValue(savedValue);
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
    if (!context || !isAssignmentEditable(context.assignment.status) || draftStatus === "conflict" || draftStatus === "saving") {
      return;
    }
    const serializedValue = serializeDraftValue(value);
    if (serializedValue === lastSavedDraftRef.current) {
      clearDraftTimer();
      if (draftStatus === "dirty" || draftStatus === "error") {
        setDraftStatus(context.assignment.draftSavedAt ? "saved" : "idle");
        setDraftError(null);
      }
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
    if (serializeDraftValue(value) === lastSavedDraftRef.current) {
      clearDraftTimer();
      setDraftStatus(context?.assignment.draftSavedAt ? "saved" : "idle");
      setDraftError(null);
      message.info("当前没有新的草稿改动。");
      return;
    }
    void persistDraft(value, "manual");
  }

  async function handleSubmitAssignment() {
    if (!context || submitting) {
      return;
    }
    if (!isAssignmentEditable(context.assignment.status)) {
      message.info("当前题目已提交，不能重复提交。");
      return;
    }
    if (draftStatus === "saving") {
      message.warning("草稿正在保存，请稍后再提交。");
      return;
    }

    clearDraftTimer();
    const cleanedValue = pruneHiddenSubmissionValue(context.templateSchema, value);
    const nextErrors = validateTemplateSubmissionValue(context.templateSchema, cleanedValue);
    if (serializeDraftValue(value) !== serializeDraftValue(cleanedValue)) {
      valueRef.current = cleanedValue;
      setValue(cleanedValue);
    }
    if (nextErrors.length > 0) {
      setSubmitErrors([]);
      setSubmitError("请先修正字段错误后再提交。");
      message.error("请先修正字段错误后再提交。");
      return;
    }

    setSubmitting(true);
    setSubmitErrors([]);
    setSubmitError(null);
    try {
      const submission = await createSubmission(context.assignment.id, {
        values: cleanedValue,
        idempotencyKey: buildSubmissionIdempotencyKey(context.assignment.id),
        clientDraftVersion: context.assignment.version,
      });
      lastSavedDraftRef.current = serializeDraftValue(submission.values);
      valueRef.current = submission.values;
      setValue(submission.values);
      const isReturnedRevision = isReviseMode && context.assignment.status === "RETURNED";
      message.success(`${isReturnedRevision ? "返修提交成功" : "提交成功"}，已生成第 ${submission.submissionVersion} 版`);
      await fetchContext();
    } catch (requestError) {
      const serverErrors = getServerSubmissionErrors(requestError);
      setSubmitErrors(serverErrors);
      setSubmitError(getErrorMessage(requestError));
      if (getErrorCode(requestError) === "ASSIGNMENT_VERSION_CONFLICT") {
        setDraftStatus("conflict");
        setDraftError(getErrorMessage(requestError));
      }
      message.error(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
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
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backPath)}>
              {backLabel}
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
  const isReturnedRevision = isReviseMode && assignment.status === "RETURNED";
  const statusMeta = assignmentStatusMeta[assignment.status];
  const draftMeta = draftSaveStatusMeta[draftStatus];
  const editable = isAssignmentEditable(assignment.status);
  const submitDisabledReason = !editable
    ? "当前题目已提交或不可编辑"
    : draftStatus === "saving"
      ? "草稿保存中，请稍后提交"
      : draftStatus === "conflict"
        ? "题目版本冲突，请重新加载"
        : localSubmitErrors.length > 0
          ? "请先修正字段错误"
          : "";
  const submitDisabled = submitting || Boolean(submitDisabledReason);
  const currentJumpValue = jumpAssignments.some((item) => item.id === assignment.id) ? assignment.id : undefined;
  const draftTimeText = assignment.draftSavedAt ? formatTaskTime(assignment.draftSavedAt) : "尚未保存";
  const submittedTimeText = assignment.submittedAt ? formatTaskTime(assignment.submittedAt) : null;
  const latestSubmission = context.latestSubmission;

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
              onChange={(nextAssignmentId) => navigate(buildPeerPath(nextAssignmentId))}
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
                    onClick={() => navigate(buildPeerPath(item.id))}
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
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backPath)}>
                  {backLabel}
                </Button>
                <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                <Tag color={draftMeta.color}>{draftMeta.label}</Tag>
                <Tag color="blue">模板 {assignment.templateVersionId.slice(0, 18)}</Tag>
              </Space>
              <Typography.Title level={2} style={{ margin: "14px 0 6px" }}>
                {isReturnedRevision ? `打回修改 · ${task.title}` : task.title} · 第 {navigation.currentIndex} 题
              </Typography.Title>
              <Typography.Text type="secondary">
                题目 ID {assignment.datasetItemId.slice(0, 18)} · 领取时间 {formatTaskTime(assignment.claimedAt)}
              </Typography.Text>
            </div>
            <Space wrap>
              <Tooltip title="题目异常报告将在后续质量流程中接入">
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
            {isReviseMode && !isReturnedRevision && (
              <Alert
                type="info"
                showIcon
                message="当前题目未处于打回状态"
                description="返修入口只对已打回题目生效；当前页面将按普通作答规则处理，你也可以返回我的贡献查看需要修改的题目。"
              />
            )}
            {context.reviewFeedback && (
              <Alert
                type="warning"
                showIcon
                message={isReturnedRevision ? "上一轮审核意见" : "审核意见"}
                description={
                  <Space direction="vertical" size={4}>
                    <Typography.Text>{context.reviewFeedback.reason}</Typography.Text>
                    <Typography.Text type="secondary">
                      打回时间：{formatTaskTime(context.reviewFeedback.returnedAt)}
                    </Typography.Text>
                  </Space>
                }
              />
            )}
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
            {!editable && latestSubmission && (
              <Alert
                type="success"
                showIcon
                message={`已提交第 ${latestSubmission.submissionVersion} 版`}
                description={submittedTimeText ? `提交时间：${submittedTimeText}` : "提交版本已写入服务端。"}
              />
            )}
            {submitError && editable && (
              <Alert
                type={visibleSubmitErrors.length > 0 ? "error" : "warning"}
                showIcon
                message={submitError}
                description={
                  visibleSubmitErrors.length > 0
                    ? `还有 ${visibleSubmitErrors.length} 个字段需要修正，字段下方已给出具体原因。`
                    : undefined
                }
              />
            )}
            <TemplateRenderer
              key={context.assignment.id}
              schema={context.templateSchema}
              itemPayload={context.datasetItemPayload}
              value={value}
              onChange={handleValueChange}
              readonly={!editable || draftStatus === "conflict" || submitting}
              serverErrors={submitErrors}
              onUploadFile={handleEvidenceFileUpload}
              onRunLlmAction={handleRunTemplateLlmAction}
            />
          </Space>
        </Card>

        <Card className="labelhub-assignment-footer">
          <Flex align="center" justify="space-between" gap={12} wrap="wrap">
            <Space wrap>
              <Button
                icon={<LeftOutlined />}
                disabled={!navigation.previousAssignmentId}
                onClick={() => navigation.previousAssignmentId && navigate(buildPeerPath(navigation.previousAssignmentId))}
              >
                上一题
              </Button>
              <Button
                icon={<ArrowRightOutlined />}
                disabled={!navigation.nextAssignmentId}
                onClick={() => navigation.nextAssignmentId && navigate(buildPeerPath(navigation.nextAssignmentId))}
              >
                下一题
              </Button>
            </Space>
            <Space wrap>
              <Typography.Text type="secondary">
                {!editable && submittedTimeText
                  ? `已提交：${submittedTimeText}`
                  : draftStatus === "saved"
                    ? `上次保存：${draftTimeText}`
                    : draftMeta.message}
              </Typography.Text>
              <Tooltip title={draftStatus === "conflict" ? "服务端已有更新，先重新加载避免覆盖他人草稿" : "立即保存当前草稿"}>
                <Button
                  icon={draftStatus === "conflict" ? <ReloadOutlined /> : <SaveOutlined />}
                  loading={draftStatus === "saving"}
                  disabled={!editable}
                  onClick={() => void handleSaveDraftNow()}
                >
                  {draftStatus === "conflict" ? "重新加载题目" : isReturnedRevision ? "保存返修草稿" : "保存草稿"}
                </Button>
              </Tooltip>
              <Tooltip title={submitDisabledReason || "提交后将生成正式版本，后续进入预审与审核流程"}>
                <Button
                  type="primary"
                  loading={submitting}
                  disabled={submitDisabled}
                  onClick={() => void handleSubmitAssignment()}
                >
                  {editable ? (isReturnedRevision ? "重新提交审核" : "提交本题") : "已提交"}
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
            {assignment.submittedAt && (
              <div>
                <strong>正式提交</strong>
                <span>{formatTaskTime(assignment.submittedAt)}</span>
              </div>
            )}
            {context.reviewFeedback && (
              <div>
                <strong>审核打回</strong>
                <span>{formatTaskTime(context.reviewFeedback.returnedAt)}</span>
              </div>
            )}
            {latestSubmission && (
              <div>
                <strong>提交版本</strong>
                <span>第 {latestSubmission.submissionVersion} 版</span>
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
