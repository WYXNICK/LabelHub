import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  DiffOutlined,
  EditOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Input,
  Modal,
  Pagination,
  Progress,
  Select,
  Space,
  Statistic,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { batchDecideReviews, decideReview, getReviewDetail, listReviews } from "../features/reviews/api";
import type {
  AiReviewConclusion,
  HumanReviewDecision,
  ReviewDetailVO,
  ReviewStatus,
  ReviewVO,
} from "../features/reviews/types";
import {
  aiConclusionMeta,
  buildReviewerReviewDetailPath,
  formatAiScoreTotal,
  formatReviewConfigVersion,
  formatReviewScorePercent,
  formatReviewTimelineAction,
  formatReviewTimelineActor,
  formatReviewTraceCode,
  formatReviewValue,
  formatSubmissionVersion,
  getReviewTimelineDotColor,
  normalizeReviewScoreToPercent,
  reviewStatusMeta,
  submissionDiffChangeMeta,
} from "../features/reviews/view";
import { formatTaskTime } from "../features/tasks/view";
import type { JsonObject } from "../shared/types/api";

const reviewPageSize = 20;
const reviewStatusOptions: Array<{ label: string; value: ReviewStatus | "ALL" }> = [
  { label: "全部审核状态", value: "ALL" },
  { label: "待人工审核", value: "PENDING_HUMAN_REVIEW" },
  { label: "已通过", value: "APPROVED" },
  { label: "已打回", value: "RETURNED" },
];
const aiConclusionOptions: Array<{ label: string; value: AiReviewConclusion | "ALL" }> = [
  { label: "全部 AI 结论", value: "ALL" },
  { label: aiConclusionMeta.PASS.label, value: "PASS" },
  { label: aiConclusionMeta.RETURN.label, value: "RETURN" },
  { label: aiConclusionMeta.NEEDS_HUMAN_REVIEW.label, value: "NEEDS_HUMAN_REVIEW" },
];

interface ReviewerReviewQueuePageProps {
  taskId: string;
}

interface ReviewQueueState {
  reviews: ReviewVO[];
  totalReviews: number;
}

type ReviewMode = "RECHECK" | "FINAL";
const quickReviewReasonTags = ["关键词缺失", "类目错误", "理由不充分", "格式不规范", "事实不一致"];

export function ReviewerReviewQueuePage({ taskId }: ReviewerReviewQueuePageProps) {
  const { message, modal } = AntdApp.useApp();
  const [reviewMode, setReviewMode] = useState<ReviewMode>("RECHECK");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | "ALL">("PENDING_HUMAN_REVIEW");
  const [aiConclusion, setAiConclusion] = useState<AiReviewConclusion | "ALL">("ALL");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [reviewPage, setReviewPage] = useState(1);
  const [state, setState] = useState<ReviewQueueState>({ reviews: [], totalReviews: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ReviewDetailVO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [batchReturnReason, setBatchReturnReason] = useState("");
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const reviewResultPage = await listReviews({
        page: reviewPage,
        pageSize: reviewPageSize,
        taskId,
        status: reviewStatus === "ALL" ? undefined : reviewStatus,
        aiConclusion: aiConclusion === "ALL" ? undefined : aiConclusion,
        keyword: keyword.trim() || undefined,
      });
      setState({ reviews: reviewResultPage.data, totalReviews: reviewResultPage.pagination.totalItems });
      setSelectedReviewIds((current) =>
        current.filter((reviewId) =>
          reviewResultPage.data.some((review) => review.id === reviewId && review.status === "PENDING_HUMAN_REVIEW"),
        ),
      );
      setSelectedReviewId((current) =>
        current && reviewResultPage.data.some((review) => review.id === current) ? current : (reviewResultPage.data[0]?.id ?? null),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "人工审核任务工作台暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [aiConclusion, keyword, reviewPage, reviewStatus, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedReviewId) {
      setSelectedDetail(null);
      return;
    }
    setDetailLoading(true);
    getReviewDetail(selectedReviewId)
      .then((detail) => setSelectedDetail(detail))
      .catch((err) => {
        setSelectedDetail(null);
        message.warning(err instanceof Error ? err.message : "审核详情加载失败。");
      })
      .finally(() => setDetailLoading(false));
  }, [message, selectedReviewId]);

  const taskTitle = selectedDetail?.task.title ?? state.reviews[0]?.taskTitle ?? "人工审核任务";
  const stats = useMemo(() => buildReviewStats(state.reviews), [state.reviews]);
  const selectableReviews = useMemo(
    () => state.reviews.filter((review) => review.status === "PENDING_HUMAN_REVIEW"),
    [state.reviews],
  );
  const selectedReviews = useMemo(
    () => selectableReviews.filter((review) => selectedReviewIds.includes(review.id)),
    [selectableReviews, selectedReviewIds],
  );
  const allCurrentSelected = selectableReviews.length > 0 && selectedReviews.length === selectableReviews.length;
  const partiallySelected = selectedReviews.length > 0 && !allCurrentSelected;

  async function submitBatchDecision(decision: HumanReviewDecision, reason?: string) {
    if (selectedReviews.length === 0) {
      message.warning("请先选择待人工审核记录。");
      return;
    }
    setBatchSubmitting(true);
    try {
      const result = await batchDecideReviews({
        reviewIds: selectedReviews.map((review) => review.id),
        decision,
        reason: reason?.trim() || undefined,
        expectedVersions: Object.fromEntries(selectedReviews.map((review) => [review.id, review.version])),
      });
      const failedCount = Object.keys(result.failed).length;
      if (failedCount > 0) {
        message.warning(`批量处理完成：成功 ${result.succeededIds.length} 条，失败 ${failedCount} 条。`);
      } else {
        message.success(`批量处理成功：${result.succeededIds.length} 条。`);
      }
      setSelectedReviewIds((current) => current.filter((reviewId) => !result.succeededIds.includes(reviewId)));
      await reloadDetail();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "批量审核提交失败。");
    } finally {
      setBatchSubmitting(false);
    }
  }

  async function reloadDetail() {
    await load();
    if (selectedReviewId) {
      setDetailLoading(true);
      try {
        setSelectedDetail(await getReviewDetail(selectedReviewId));
      } catch {
        setSelectedDetail(null);
      } finally {
        setDetailLoading(false);
      }
    }
  }

  function confirmBatchApprove() {
    modal.confirm({
      title: "确认批量通过？",
      content: `将通过当前任务内已选择的 ${selectedReviews.length} 条提交，状态会进入 Owner 数据验收。`,
      okText: "批量通过",
      cancelText: "取消",
      onOk: () => submitBatchDecision("APPROVE"),
    });
  }

  async function handleBatchReturn() {
    const reason = batchReturnReason.trim();
    if (!reason) {
      message.warning("批量打回必须填写统一理由。");
      return;
    }
    await submitBatchDecision("RETURN", reason);
    setBatchReturnReason("");
    setReturnModalOpen(false);
  }

  const triggerSearch = () => {
    const nextKeyword = keywordInput.trim();
    setReviewPage(1);
    setKeyword(nextKeyword);
    if (reviewPage === 1 && keyword === nextKeyword) {
      void load();
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card className="labelhub-reviewer-workbench-head">
        <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
          <Space direction="vertical" size={8}>
            <Space wrap>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/reviewer/reviews")}>
                返回任务列表
              </Button>
              <Tag color={reviewMode === "RECHECK" ? "blue" : "orange"}>
                {reviewMode === "RECHECK" ? "复审视角" : "终审视角"}
              </Tag>
              <Button onClick={() => setReviewMode((mode) => (mode === "RECHECK" ? "FINAL" : "RECHECK"))}>
                切换：{reviewMode === "RECHECK" ? "终审" : "复审"}
              </Button>
            </Space>
            <div>
              <Typography.Title level={2} style={{ margin: 0 }} title={taskTitle}>
                人工审核 · {taskTitle}
              </Typography.Title>
              <Typography.Text type="secondary">
                当前任务内处理复审/终审、批量通过/打回、第 1 / 2 轮 diff、AI 评语和关键流转时间线。
              </Typography.Text>
            </div>
          </Space>
          <Space wrap>
            <Button
              icon={<FileSearchOutlined />}
              disabled={!selectedReviewId}
              onClick={() => selectedReviewId && navigate(buildReviewerReviewDetailPath(selectedReviewId, { from: "task", taskId }))}
            >
              查看深度详情
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void reloadDetail()} loading={loading}>
              刷新
            </Button>
          </Space>
        </Flex>
      </Card>

      {error && <Alert showIcon type="warning" message="人工审核任务加载失败" description={error} />}

      <div className="labelhub-reviewer-workbench-grid">
        <Card className="labelhub-reviewer-queue-card" title="审核工作台" loading={loading}>
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Typography.Text type="secondary">按 AI 建议分组处理当前任务内提交，避免跨任务误批量。</Typography.Text>
            <div className="labelhub-reviewer-filter-tabs">
              <button data-active={aiConclusion === "PASS"} type="button" onClick={() => setAiConclusion("PASS")}>
                AI 建议通过 <strong>{stats.pass}</strong>
              </button>
              <button data-active={aiConclusion === "RETURN"} type="button" onClick={() => setAiConclusion("RETURN")}>
                建议打回 <strong>{stats.return}</strong>
              </button>
              <button data-active={aiConclusion === "NEEDS_HUMAN_REVIEW"} type="button" onClick={() => setAiConclusion("NEEDS_HUMAN_REVIEW")}>
                转人工 <strong>{stats.manual}</strong>
              </button>
              <button data-active={aiConclusion === "ALL"} type="button" onClick={() => setAiConclusion("ALL")}>
                全部 <strong>{state.totalReviews}</strong>
              </button>
            </div>
            <Space wrap>
              <Input
                allowClear
                aria-label="搜索任务标题或 ID"
                name="reviewTaskKeyword"
                prefix={<SearchOutlined />}
                placeholder="搜索标题或 ID"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onPressEnter={triggerSearch}
                style={{ width: 210 }}
              />
              <Select
                value={reviewStatus}
                options={reviewStatusOptions}
                onChange={(value) => {
                  setReviewPage(1);
                  setReviewStatus(value);
                }}
                style={{ width: 150 }}
              />
              <Select
                value={aiConclusion}
                options={aiConclusionOptions}
                onChange={(value) => {
                  setReviewPage(1);
                  setAiConclusion(value);
                }}
                style={{ width: 150 }}
              />
              <Button type="primary" ghost onClick={triggerSearch}>
                查询
              </Button>
            </Space>
            <Flex align="center" justify="space-between" gap={10} wrap="wrap">
              <Checkbox
                name="selectCurrentReviewPage"
                checked={allCurrentSelected}
                indeterminate={partiallySelected}
                disabled={selectableReviews.length === 0}
                onChange={(event) =>
                  setSelectedReviewIds(event.target.checked ? selectableReviews.map((review) => review.id) : [])
                }
              >
                本页待审
              </Checkbox>
              <Space wrap>
                <Button size="small" disabled={selectedReviews.length === 0} loading={batchSubmitting} onClick={confirmBatchApprove}>
                  批量通过
                </Button>
                <Button
                  size="small"
                  danger
                  disabled={selectedReviews.length === 0}
                  loading={batchSubmitting}
                  onClick={() => setReturnModalOpen(true)}
                >
                  批量打回
                </Button>
              </Space>
            </Flex>
            <div className="labelhub-reviewer-job-list">
              {state.reviews.length === 0 ? (
                <Empty description="当前筛选下暂无审核记录。" />
              ) : (
                state.reviews.map((review) => (
                  <ReviewRecordRow
                    key={review.id}
                    review={review}
                    selected={selectedReviewIds.includes(review.id)}
                    active={selectedReviewId === review.id}
                    onSelect={() => setSelectedReviewId(review.id)}
                    onToggle={(checked) =>
                      setSelectedReviewIds((current) =>
                        checked ? Array.from(new Set([...current, review.id])) : current.filter((item) => item !== review.id),
                      )
                    }
                  />
                ))
              )}
              {state.totalReviews > reviewPageSize && (
                <Flex justify="flex-end" className="labelhub-reviewer-pagination">
                  <Pagination
                    current={reviewPage}
                    pageSize={reviewPageSize}
                    total={state.totalReviews}
                    showSizeChanger={false}
                    showTotal={(total) => `共 ${total} 条审核记录`}
                    onChange={setReviewPage}
                  />
                </Flex>
              )}
            </div>
          </Space>
        </Card>

        <ReviewWorkbenchCenter detail={selectedDetail} loading={detailLoading} reviewMode={reviewMode} onReload={reloadDetail} />

        <ReviewWorkbenchSide detail={selectedDetail} stats={stats} />
      </div>

      <Modal
        title="批量打回"
        open={returnModalOpen}
        okText="确认打回"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: batchSubmitting }}
        onOk={() => void handleBatchReturn()}
        onCancel={() => setReturnModalOpen(false)}
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Alert showIcon type="warning" message={`将打回 ${selectedReviews.length} 条记录，理由会同步给标注员返修。`} />
          <Input.TextArea
            rows={4}
            maxLength={800}
            showCount
            value={batchReturnReason}
            onChange={(event) => setBatchReturnReason(event.target.value)}
            placeholder="请输入统一打回理由，例如依据不足、偏好选择与理由不一致或格式不符合任务要求。"
          />
        </Space>
      </Modal>
    </Space>
  );
}

function ReviewWorkbenchCenter({
  detail,
  loading,
  reviewMode,
  onReload,
}: {
  detail: ReviewDetailVO | null;
  loading: boolean;
  reviewMode: ReviewMode;
  onReload: () => Promise<void>;
}) {
  const { message } = AntdApp.useApp();
  const [reviewReason, setReviewReason] = useState("");
  const [reviewReasonError, setReviewReasonError] = useState<string | null>(null);
  const [submittingDecision, setSubmittingDecision] = useState<HumanReviewDecision | null>(null);
  const [directReviseOpen, setDirectReviseOpen] = useState(false);
  const [directReviseJson, setDirectReviseJson] = useState("{}");
  const review = detail?.review;

  useEffect(() => {
    setReviewReason("");
    setReviewReasonError(null);
    setDirectReviseOpen(false);
    setDirectReviseJson(JSON.stringify(detail?.submission.values ?? {}, null, 2));
  }, [detail?.review.id, detail?.submission.values]);

  async function submitDecision(decision: HumanReviewDecision, revisedValues?: JsonObject): Promise<boolean> {
    if (!review) return false;
    const reason = reviewReason.trim();
    if (decision === "RETURN" && !reason) {
      setReviewReasonError("打回必须填写明确理由");
      return false;
    }
    setReviewReasonError(null);
    setSubmittingDecision(decision);
    try {
      await decideReview(review.id, {
        decision,
        reason: reason || undefined,
        revisedValues,
        expectedVersion: review.version,
      });
      const successText: Record<HumanReviewDecision, string> = {
        APPROVE: "已通过并入库。",
        RETURN: "已打回并同步给标注员。",
        DIRECT_REVISE: "已直接修订并入库。",
      };
      message.success(successText[decision]);
      await onReload();
      return true;
    } catch (err) {
      message.error(err instanceof Error ? err.message : "人工审核决策提交失败。");
      return false;
    } finally {
      setSubmittingDecision(null);
    }
  }

  function appendReasonTag(tag: string) {
    const current = reviewReason.trim();
    const next = current.includes(tag) ? current : `${current}${current ? "；" : ""}${tag}`;
    setReviewReason(next);
    setReviewReasonError(null);
  }

  async function handleDirectReviseConfirm() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(directReviseJson);
    } catch {
      message.error("修订值必须是合法 JSON 对象。");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      message.error("修订值必须是 JSON 对象，不能是数组或空值。");
      return;
    }
    const ok = await submitDecision("DIRECT_REVISE", parsed as JsonObject);
    if (ok) {
      setDirectReviseOpen(false);
    }
  }

  if (!detail && !loading) {
    return (
      <Card className="labelhub-reviewer-workbench-main">
        <Empty description="请选择当前任务中的一条审核记录。" />
      </Card>
    );
  }

  const conclusion = review?.aiConclusion ? aiConclusionMeta[review.aiConclusion] : null;
  const readonly = review?.status !== "PENDING_HUMAN_REVIEW";

  return (
    <Space direction="vertical" size={14} className="labelhub-reviewer-workbench-main">
      <Card className="labelhub-reviewer-selected-head" loading={loading}>
        {detail && review && (
          <Flex justify="space-between" align="flex-start" gap={14} wrap="wrap">
            <div className="labelhub-reviewer-selected-title-wrap">
              <Space wrap>
                <Tag color={reviewStatusMeta[review.status].color}>{reviewStatusMeta[review.status].label}</Tag>
                {conclusion && <Tag color={conclusion.color}>{conclusion.label}</Tag>}
                <Tag>{formatSubmissionVersion(review.submissionVersion)}</Tag>
                <Tag color={reviewMode === "RECHECK" ? "blue" : "orange"}>
                  {reviewMode === "RECHECK" ? "复审中" : "终审中"}
                </Tag>
              </Space>
              <Typography.Title level={3} className="labelhub-reviewer-selected-title" title={detail.task.title}>
                {detail.task.title}
              </Typography.Title>
              <Typography.Text type="secondary">
                {formatReviewTraceCode(review.id)} · {formatReviewConfigVersion(review.reviewConfigVersionNo)} · 第 {review.reviewRound} 轮
              </Typography.Text>
            </div>
            <Button icon={<FileSearchOutlined />} onClick={() => navigate(buildReviewerReviewDetailPath(review.id, { from: "task", taskId: detail.task.id }))}>
              查看审核详情
            </Button>
          </Flex>
        )}
      </Card>

      <ReviewRoundDiff detail={detail} loading={loading} />

      <Card
        className="labelhub-reviewer-ai-card"
        loading={loading}
        title={
          <Space>
            <ThunderboltOutlined />
            <span>AI 预审 · 本轮重跑结果</span>
          </Space>
        }
        extra={conclusion ? <Tag color={conclusion.color}>{conclusion.label}</Tag> : <Tag>暂无结论</Tag>}
      >
        {detail && review && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div className="labelhub-reviewer-ai-score-grid">
              {detail.reviewConfigVersion.dimensions.slice(0, 4).map((dimension) => {
                const score = review.aiScores[dimension.key] ?? 0;
                const percent = normalizeReviewScoreToPercent(score, dimension.maxScore);
                return (
                  <div key={dimension.key} className="labelhub-reviewer-ai-score-row">
                    <Typography.Text className="labelhub-reviewer-ai-score-name" title={dimension.name}>
                      {dimension.name}
                    </Typography.Text>
                    <Progress
                      percent={percent}
                      size="small"
                      strokeColor={percent >= 80 ? "#13a867" : percent >= 60 ? "#ff8800" : "#ff4d4f"}
                      format={() => formatReviewScorePercent(score, dimension.maxScore)}
                    />
                  </div>
                );
              })}
            </div>
            <Typography.Paragraph style={{ margin: 0 }}>
              综合 {formatAiScoreTotal(review.aiScoreTotal)}。{review.aiComment || "AI 暂无评语。"}
            </Typography.Paragraph>
            {review.aiIssues.length > 0 && (
              <Space size={[6, 6]} wrap>
                {review.aiIssues.map((issue, index) => (
                  <Tag key={`${issue.code}-${index}`} color={review.aiConclusion === "RETURN" ? "orange" : "blue"}>
                    {issue.field ?? "全局"} · {issue.code}
                  </Tag>
                ))}
              </Space>
            )}
          </Space>
        )}
      </Card>

      <Card title={reviewMode === "RECHECK" ? "复审意见" : "终审意见"} loading={loading}>
        {detail && review && (
          <>
            {readonly ? (
              <Alert
                type={review.status === "APPROVED" ? "success" : "warning"}
                showIcon
                message={
                  review.humanConclusion === "DIRECT_REVISE"
                    ? "该记录已由 Reviewer 直接修订并通过"
                    : review.status === "APPROVED"
                      ? "该记录已通过"
                      : "该记录已打回"
                }
                description={review.humanComment || "人工审核已完成。"}
              />
            ) : (
              <>
                <div className="labelhub-reviewer-reason-field">
                  <Typography.Text strong>
                    审核意见（打回时必填）
                  </Typography.Text>
                  <Input.TextArea
                    aria-label="审核意见"
                    name="reviewDecisionReason"
                    rows={4}
                    maxLength={800}
                    showCount
                    status={reviewReasonError ? "error" : undefined}
                    value={reviewReason}
                    onChange={(event) => {
                      setReviewReason(event.target.value);
                      if (reviewReasonError) setReviewReasonError(null);
                    }}
                    placeholder="可选：记录通过原因、抽样备注；打回时请说明需要返修的具体问题。"
                  />
                  {reviewReasonError && <Typography.Text type="danger">{reviewReasonError}</Typography.Text>}
                </div>
                <Space size={[8, 8]} wrap className="labelhub-reviewer-reason-tags">
                  {quickReviewReasonTags.map((tag) => (
                    <Button key={tag} size="small" onClick={() => appendReasonTag(tag)}>
                      # {tag}
                    </Button>
                  ))}
                </Space>
                <div className="labelhub-reviewer-decision-grid">
                  <div className="labelhub-reviewer-decision-card labelhub-reviewer-decision-return">
                    <CloseCircleOutlined />
                    <strong>打回</strong>
                    <span>回到标注员修改，进入下一轮</span>
                    <Button danger loading={submittingDecision === "RETURN"} onClick={() => void submitDecision("RETURN")}>
                      打回并说明原因
                    </Button>
                  </div>
                  <div className="labelhub-reviewer-decision-card labelhub-reviewer-decision-direct">
                    <EditOutlined />
                    <strong>直接修订</strong>
                    <span>审核员规范改写并入库</span>
                    <Button
                      loading={submittingDecision === "DIRECT_REVISE"}
                      onClick={() => {
                        setDirectReviseJson(JSON.stringify(detail.submission.values ?? {}, null, 2));
                        setDirectReviseOpen(true);
                      }}
                    >
                      修订并入库
                    </Button>
                  </div>
                  <div className="labelhub-reviewer-decision-card labelhub-reviewer-decision-pass">
                    <CheckCircleOutlined />
                    <strong>通过 · 入库</strong>
                    <span>{reviewMode === "FINAL" ? "终审通过，可参与导出" : "本条进入终审通过"}</span>
                    <Button
                      type="primary"
                      loading={submittingDecision === "APPROVE"}
                      onClick={() => void submitDecision("APPROVE")}
                    >
                      通过并入库
                    </Button>
                  </div>
                </div>
                <Typography.Text type="secondary" className="labelhub-reviewer-decision-hint">
                  提交后会写入状态机和审计日志；直接修订会先按当前模板校验修订值。
                </Typography.Text>
                <Modal
                  title="直接修订并入库"
                  open={directReviseOpen}
                  okText="修订并入库"
                  cancelText="取消"
                  confirmLoading={submittingDecision === "DIRECT_REVISE"}
                  onOk={() => void handleDirectReviseConfirm()}
                  onCancel={() => setDirectReviseOpen(false)}
                  width={720}
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Alert
                      type="info"
                      showIcon
                      message="请只修订必要字段"
                      description="系统会用当前任务模板校验 JSON 对象，校验通过后本条直接通过并入库。"
                    />
                    <Input.TextArea
                      aria-label="直接修订 JSON"
                      name="directReviseValues"
                      value={directReviseJson}
                      onChange={(event) => setDirectReviseJson(event.target.value)}
                      rows={12}
                      spellCheck={false}
                      className="labelhub-reviewer-direct-json"
                    />
                  </Space>
                </Modal>
              </>
            )}
          </>
        )}
      </Card>
    </Space>
  );
}

function ReviewRoundDiff({ detail, loading }: { detail: ReviewDetailVO | null; loading: boolean }) {
  return (
    <div className="labelhub-reviewer-round-grid">
      <Card
        title={`第 ${Math.max((detail?.review.reviewRound ?? 1) - 1, 1)} 轮提交${(detail?.review.reviewRound ?? 1) > 1 ? "（上一轮）" : "（首轮无上一版）"}`}
        loading={loading}
        extra={detail?.submissionDiff.length ? <Tag color="red">有差异</Tag> : <Tag>无差异</Tag>}
      >
        {detail ? <RoundValueList detail={detail} side="previous" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      </Card>
      <Card
        title={`第 ${detail?.review.reviewRound ?? 1} 轮提交（本轮）`}
        loading={loading}
        extra={<Tag color="blue">待复审</Tag>}
      >
        {detail ? <RoundValueList detail={detail} side="current" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      </Card>
    </div>
  );
}

function RoundValueList({ detail, side }: { detail: ReviewDetailVO; side: "previous" | "current" }) {
  const changed = detail.submissionDiff;
  if (changed.length > 0) {
    return (
      <div className="labelhub-reviewer-field-list">
        {changed.map((item) => (
          <div key={`${side}-${item.fieldKey}`} className="labelhub-reviewer-field-row">
            <span>{item.label}</span>
            <strong>{formatReviewValue(side === "previous" ? item.previousValue : item.currentValue)}</strong>
          </div>
        ))}
      </div>
    );
  }
  if (side === "previous" && detail.review.reviewRound <= 1) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="首轮提交暂无上一版。" />;
  }
  const values = detail.submission.values ?? {};
  return (
    <div className="labelhub-reviewer-field-list">
      {Object.entries(values).map(([key, value]) => (
        <div key={`${side}-${key}`} className="labelhub-reviewer-field-row">
          <span>{key}</span>
          <strong>{formatReviewValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function ReviewWorkbenchSide({
  detail,
  stats,
}: {
  detail: ReviewDetailVO | null;
  stats: ReturnType<typeof buildReviewStats>;
}) {
  return (
    <Space direction="vertical" size={14} className="labelhub-reviewer-workbench-side">
      <Card title="我的审核">
        <div className="labelhub-reviewer-side-stat-grid">
          <Statistic title="本页建议通过" value={stats.pass} valueStyle={{ color: "#13a867" }} />
          <Statistic title="本页建议打回" value={stats.return} valueStyle={{ color: "#d46b08" }} />
          <Statistic title="转人工" value={stats.manual} valueStyle={{ color: "#7c3aed" }} />
          <Statistic title="待处理" value={stats.pending} />
        </div>
      </Card>
      <Card title="关键流转时间线" extra={<Tag>过滤草稿</Tag>}>
        {detail ? (
          <div className="labelhub-reviewer-timeline-scroll">
            <Timeline
              items={detail.timeline.map((item) => ({
                dot: <ClockCircleOutlined style={{ color: getReviewTimelineDotColor(item) }} />,
                children: (
                  <div className="labelhub-reviewer-timeline-item">
                    <Flex justify="space-between" align="baseline" gap={8} wrap="nowrap">
                      <Typography.Text strong className="labelhub-reviewer-timeline-actor">
                        {formatReviewTimelineActor(item)}
                      </Typography.Text>
                      <Typography.Text type="secondary" className="labelhub-reviewer-timeline-time">
                        {formatTaskTime(item.createdAt)}
                      </Typography.Text>
                    </Flex>
                    <Typography.Text className="labelhub-reviewer-timeline-action">
                      {formatReviewTimelineAction(item)}
                    </Typography.Text>
                    {item.reason && (
                      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: "4px 0 0" }}>
                        {item.reason}
                      </Typography.Paragraph>
                    )}
                  </div>
                ),
              }))}
            />
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择记录后展示时间线。" />
        )}
      </Card>
      <Card title="任务上下文">
        {detail ? (
          <div className="labelhub-reviewer-kv">
            <span>任务</span>
            <strong>{detail.task.title}</strong>
            <span>模板版本</span>
            <strong>{formatReviewTraceCode(detail.assignment.templateVersionId)}</strong>
            <span>审核配置</span>
            <strong>{formatReviewConfigVersion(detail.review.reviewConfigVersionNo)}</strong>
            <span>策略</span>
            <strong>AI 预审 + 人工终审</strong>
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务上下文。" />
        )}
      </Card>
    </Space>
  );
}

function ReviewRecordRow({
  review,
  selected,
  active,
  onSelect,
  onToggle,
}: {
  review: ReviewVO;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  onToggle: (checked: boolean) => void;
}) {
  const status = reviewStatusMeta[review.status];
  const conclusion = review.aiConclusion ? aiConclusionMeta[review.aiConclusion] : null;
  const selectable = review.status === "PENDING_HUMAN_REVIEW";
  return (
    <button
      className="labelhub-reviewer-job-row"
      data-active={active}
      data-tone={conclusion?.color === "orange" ? "orange" : conclusion?.color === "green" ? "green" : "blue"}
      type="button"
      onClick={onSelect}
    >
      <div className="labelhub-reviewer-job-main">
        <Flex align="center" gap={8} wrap="nowrap">
          {selectable && (
            <Checkbox
              aria-label={`选择审核记录 ${formatReviewTraceCode(review.id)}`}
              name={`selectReview-${review.id}`}
              checked={selected}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onToggle(event.target.checked)}
            />
          )}
          <Typography.Text
            strong
            className="labelhub-reviewer-job-title"
            title={`${formatSubmissionVersion(review.submissionVersion)} · ${formatReviewTraceCode(review.id)}`}
          >
            {formatSubmissionVersion(review.submissionVersion)} · {formatReviewTraceCode(review.id)}
          </Typography.Text>
          <Tag color={status.color}>{status.label}</Tag>
        </Flex>
        <Space size={[6, 6]} wrap style={{ marginTop: 8 }}>
          {conclusion && <Tag color={conclusion.color}>{conclusion.label}</Tag>}
          <Tag>{formatSubmissionVersion(review.submissionVersion)}</Tag>
          <Tag>总分 {formatAiScoreTotal(review.aiScoreTotal)}</Tag>
          <Tag color={review.aiIssueCount > 0 ? "orange" : "green"}>问题 {review.aiIssueCount}</Tag>
        </Space>
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: "8px 0 0" }}>
          {review.aiComment || "AI 暂无评语，建议进入详情查看上下文。"}
        </Typography.Paragraph>
      </div>
      <Typography.Text type="secondary" className="labelhub-reviewer-job-time">
        {formatTaskTime(review.updatedAt)}
      </Typography.Text>
    </button>
  );
}

function buildReviewStats(reviews: ReviewVO[]) {
  return reviews.reduce(
    (acc, review) => {
      if (review.status === "PENDING_HUMAN_REVIEW") acc.pending += 1;
      if (review.aiConclusion === "PASS") acc.pass += 1;
      if (review.aiConclusion === "RETURN") acc.return += 1;
      if (review.aiConclusion === "NEEDS_HUMAN_REVIEW") acc.manual += 1;
      return acc;
    },
    { pass: 0, return: 0, manual: 0, pending: 0 },
  );
}
