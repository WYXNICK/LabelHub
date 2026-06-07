import {
  ClockCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Input, Pagination, Progress, Select, Space, Statistic, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { getReviewDetail, getReviewJobSummary, listReviewJobs } from "../features/reviews/api";
import type { ReviewDetailVO, ReviewJobStatus, ReviewJobSummaryVO, ReviewJobVO } from "../features/reviews/types";
import {
  aiConclusionMeta,
  buildReviewerReviewDetailPath,
  formatAiScoreTotal,
  formatLatency,
  formatReviewConfigVersion,
  formatReviewScorePercent,
  formatReviewTraceCode,
  formatReviewValue,
  formatSubmissionVersion,
  normalizeReviewScoreToPercent,
  reviewJobStatusMeta,
  truncateMiddle,
} from "../features/reviews/view";
import { formatTaskTime } from "../features/tasks/view";

const jobPageSize = 8;
const jobStatusOptions: Array<{ label: string; value: ReviewJobStatus | "ALL" }> = [
  { label: "全部状态", value: "ALL" },
  { label: "等待预审", value: "QUEUED" },
  { label: "AI 处理中", value: "RUNNING" },
  { label: "预审完成", value: "SUCCEEDED" },
  { label: "等待重试", value: "FAILED" },
  { label: "人工兜底", value: "NEEDS_HUMAN_REVIEW" },
];

interface AiQueueState {
  jobs: ReviewJobVO[];
  totalJobs: number;
  summary: ReviewJobSummaryVO | null;
}

export function ReviewerAiReviewQueuePage() {
  const [jobStatus, setJobStatus] = useState<ReviewJobStatus | "ALL">("ALL");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [state, setState] = useState<AiQueueState>({ jobs: [], totalJobs: 0, summary: null });
  const [detail, setDetail] = useState<ReviewDetailVO | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const keywordValue = keyword.trim() || undefined;
      const [jobPage, summary] = await Promise.all([
        listReviewJobs({
          page,
          pageSize: jobPageSize,
          status: jobStatus === "ALL" ? undefined : jobStatus,
          keyword: keywordValue,
        }),
        getReviewJobSummary({ keyword: keywordValue }),
      ]);
      setState({ jobs: jobPage.data, totalJobs: jobPage.pagination.totalItems, summary });
      setSelectedJobId((current) =>
        jobPage.data.some((job) => job.id === current) ? current : (jobPage.data[0]?.id ?? null),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 预审队列暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [jobStatus, keyword, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedJob = useMemo(
    () => state.jobs.find((job) => job.id === selectedJobId) ?? state.jobs[0] ?? null,
    [selectedJobId, state.jobs],
  );

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    if (!selectedJob?.reviewId) {
      return () => {
        cancelled = true;
      };
    }
    setDetailLoading(true);
    getReviewDetail(selectedJob.reviewId)
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedJob?.reviewId]);

  const triggerSearch = () => {
    const nextKeyword = keywordInput.trim();
    setPage(1);
    setKeyword(nextKeyword);
    if (page === 1 && keyword === nextKeyword) {
      void load();
    }
  };

  const summary = state.summary;
  const agentHealth = getAgentHealthView(summary);

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 6 }}>
            AI 自动预审队列
          </Typography.Title>
          <Typography.Text type="secondary">
            异步消费标注员提交，按审核配置版本调用 LLM 生成结构化结论，并写回可追溯的人工复核建议。
          </Typography.Text>
        </div>
        <Space wrap>
          <Tag color="purple">Agent v2.3 · OpenAI 兼容</Tag>
          <Tag color={agentHealth.color}>{agentHealth.label}</Tag>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        </Space>
      </Flex>

      {error && <Alert showIcon type="warning" message="AI 预审队列加载失败" description={error} />}

      <div className="labelhub-ai-review-layout">
        <Card className="labelhub-ai-review-queue-card" title="预审 Job 队列" loading={loading}>
          <Space direction="vertical" size={14} style={{ width: "100%" }} className="labelhub-ai-review-queue-body">
            <Flex gap={8} wrap="wrap">
              <Input
                allowClear
                id="ai-review-keyword"
                name="keyword"
                aria-label="搜索任务标题或 ID"
                prefix={<SearchOutlined />}
                placeholder="搜索任务标题或 ID"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onPressEnter={triggerSearch}
                style={{ minWidth: 190, flex: 1 }}
              />
              <Select
                id="ai-review-job-status"
                value={jobStatus}
                options={jobStatusOptions}
                onChange={(value) => {
                  setPage(1);
                  setJobStatus(value);
                }}
                style={{ width: 128 }}
              />
              <Button type="primary" ghost onClick={triggerSearch}>
                查询
              </Button>
            </Flex>

            <div className="labelhub-ai-review-status-tabs">
              <MetricPill label="待处理" value={summary?.statusCounts.QUEUED ?? 0} active={jobStatus === "QUEUED"} />
              <MetricPill label="已通过" value={summary?.aiConclusionCounts.PASS ?? 0} />
              <MetricPill label="建议打回" value={summary?.aiConclusionCounts.RETURN ?? 0} />
              <MetricPill label="兜底" value={summary?.statusCounts.NEEDS_HUMAN_REVIEW ?? 0} active={jobStatus === "NEEDS_HUMAN_REVIEW"} />
            </div>

            {state.jobs.length === 0 ? (
              <Empty description="当前筛选下暂无 AI 预审 Job。" />
            ) : (
              <div className="labelhub-ai-review-job-list">
                {state.jobs.map((job) => (
                  <AiReviewJobRow
                    key={job.id}
                    job={job}
                    selected={job.id === selectedJob?.id}
                    onSelect={() => setSelectedJobId(job.id)}
                  />
                ))}
              </div>
            )}

            {state.totalJobs > jobPageSize && (
              <Pagination
                size="small"
                current={page}
                pageSize={jobPageSize}
                total={state.totalJobs}
                showSizeChanger={false}
                onChange={setPage}
              />
            )}
          </Space>
        </Card>

        <Space direction="vertical" size={16} className="labelhub-ai-review-main">
          <SelectedJobHeader job={selectedJob} detail={detail} detailLoading={detailLoading} />
          <div className="labelhub-ai-review-insight-grid">
            <Card title="提交内容" className="labelhub-ai-review-card">
              {detail ? (
                <pre className="labelhub-ai-review-json">{formatReviewValue(detail.submission.values)}</pre>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="等待 Agent 写回审核记录后展示提交快照。" />
              )}
            </Card>
            <Card
              title="维度评分"
              className="labelhub-ai-review-card"
              extra={detail ? <Tag color="purple">结构化输出</Tag> : <Tag>待生成</Tag>}
            >
              {detail ? (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {detail.reviewConfigVersion.dimensions.map((dimension) => {
                    const score = detail.review.aiScores[dimension.key] ?? 0;
                    const percent = normalizeReviewScoreToPercent(score, dimension.maxScore);
                    return (
                      <div key={dimension.key} className="labelhub-ai-review-score-line">
                        <Typography.Text className="labelhub-ai-review-score-name" title={dimension.name}>
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
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评分。" />
              )}
            </Card>
          </div>

          <Card
            title="AI 评语"
            className="labelhub-ai-review-comment-card"
            extra={
              detail?.review.aiConclusion ? (
                <Tag color={aiConclusionMeta[detail.review.aiConclusion].color}>{aiConclusionMeta[detail.review.aiConclusion].label}</Tag>
              ) : (
                <Tag>等待结果</Tag>
              )
            }
          >
            {detail ? (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Typography.Paragraph style={{ margin: 0 }}>{detail.review.aiComment}</Typography.Paragraph>
                {detail.review.aiIssues.length > 0 && (
                  <Flex gap={8} wrap="wrap">
                    {detail.review.aiIssues.map((issue, index) => (
                      <Tag key={`${issue.code}-${index}`} color={detail.review.aiConclusion === "RETURN" ? "orange" : "blue"}>
                        {issue.field ?? "全局"} · {issue.code}
                      </Tag>
                    ))}
                  </Flex>
                )}
              </Space>
            ) : (
              <Typography.Text type="secondary">
                {selectedJob?.lastError || "Job 正在等待 Agent 领取、重试或写回。"}
              </Typography.Text>
            )}
          </Card>

          <Card title="审核 Prompt 快照" className="labelhub-ai-review-card">
            {detail?.promptSnapshotSummary ? (
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Typography.Text type="secondary">
                  原始题目、模板版本、提交版本和审核配置版本均作为不可变快照保存，页面默认展示摘要。
                </Typography.Text>
                <Flex gap={8} wrap="wrap">
                  {detail.promptSnapshotSummary.datasetItemKeys.map((key) => (
                    <Tag key={key} color="blue">
                      题目字段 {key}
                    </Tag>
                  ))}
                  {detail.promptSnapshotSummary.submissionFieldKeys.map((key) => (
                    <Tag key={key}>提交字段 {key}</Tag>
                  ))}
                  {detail.promptSnapshotSummary.reviewDimensionNames.map((name) => (
                    <Tag key={name} color="purple">
                      {name}
                    </Tag>
                  ))}
                </Flex>
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Prompt 快照。" />
            )}
          </Card>
        </Space>

        <Space direction="vertical" size={16} className="labelhub-ai-review-side">
          <Card title="Agent 健康度">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <HealthLine label="运行状态" value={agentHealth.healthLine} tone={agentHealth.tone} />
              {summary?.staleRunningJobCount ? (
                <HealthLine label="超时 Job" value={`${summary.staleRunningJobCount} 个`} tone="orange" />
              ) : (
                <HealthLine label="处理中 Job" value={`${summary?.runningJobCount ?? 0} 个`} />
              )}
              <HealthLine label="平均耗时" value={formatLatency(summary?.averageLatencySeconds ?? null)} />
              <HealthLine label="失败率" value={`${summary?.failureRate ?? 0}%`} tone={(summary?.failureRate ?? 0) > 10 ? "orange" : "green"} />
              <HealthLine label="最大重试" value={`${summary?.maxAttempts ?? 0} 次`} />
              <HealthLine label="锁超时" value={`${summary?.lockTimeoutSeconds ?? 300}s`} />
              {summary?.latestWorkerId && <HealthLine label="最近 Worker" value={truncateMiddle(summary.latestWorkerId, 12, 8)} />}
            </Space>
          </Card>

          <Card title="今日处理">
            <div className="labelhub-ai-review-today-grid">
              <Statistic title="已处理" value={summary?.todayProcessedCount ?? 0} />
              <Statistic title="转人工" value={summary?.todayFallbackCount ?? 0} />
              <Statistic title="建议通过" value={summary?.todayPassCount ?? 0} valueStyle={{ color: "#13a867" }} />
              <Statistic title="建议打回" value={summary?.todayReturnCount ?? 0} valueStyle={{ color: "#d46b08" }} />
            </div>
          </Card>

          <Card title="兜底策略">
            <Space direction="vertical" size={12}>
              <Typography.Text type="secondary">
                连续失败、结构化输出缺失或超过最大重试后，Job 会自动进入人工复核兜底，并保留错误摘要与 Prompt 快照。
              </Typography.Text>
              <Button block onClick={() => navigate("/reviewer/reviews")}>
                查看人工审核队列
              </Button>
            </Space>
          </Card>
        </Space>
      </div>
    </Space>
  );
}

function AiReviewJobRow({ job, selected, onSelect }: { job: ReviewJobVO; selected: boolean; onSelect: () => void }) {
  const status = reviewJobStatusMeta[job.status];
  const conclusion = job.aiConclusion ? aiConclusionMeta[job.aiConclusion] : null;
  return (
    <button className="labelhub-ai-review-job-row" data-selected={selected} type="button" onClick={onSelect}>
      <div className="labelhub-ai-review-job-row-head">
        <Typography.Text strong className="labelhub-ai-review-job-title" title={job.taskTitle || "未命名任务"}>
          {job.taskTitle || "未命名任务"}
        </Typography.Text>
        <Tag color={status.color}>{status.label}</Tag>
      </div>
      <Typography.Paragraph ellipsis={{ rows: 1 }} type="secondary" className="labelhub-ai-review-job-meta">
        {formatReviewTraceCode(job.submissionId)} · {formatSubmissionVersion(job.submissionVersion)} ·{" "}
        {formatReviewConfigVersion(job.reviewConfigVersionNo)}
      </Typography.Paragraph>
      <Flex gap={6} wrap="wrap">
        {conclusion && <Tag color={conclusion.color}>{conclusion.label}</Tag>}
        <Tag>尝试 {job.attemptCount}/{job.maxAttempts}</Tag>
        <Tag>总分 {formatAiScoreTotal(job.aiScoreTotal)}</Tag>
      </Flex>
    </button>
  );
}

function SelectedJobHeader({
  job,
  detail,
  detailLoading,
}: {
  job: ReviewJobVO | null;
  detail: ReviewDetailVO | null;
  detailLoading: boolean;
}) {
  if (!job) {
    return (
      <Card>
        <Empty description="请选择一个 AI 预审 Job。" />
      </Card>
    );
  }
  const status = reviewJobStatusMeta[job.status];
  const conclusion = job.aiConclusion ? aiConclusionMeta[job.aiConclusion] : null;
  return (
    <Card className="labelhub-ai-review-selected-head" loading={detailLoading}>
      <div className="labelhub-ai-review-selected-head-grid">
        <div className="labelhub-ai-review-selected-main">
          <Space wrap>
            <Tag color={status.color}>{status.label}</Tag>
            {conclusion && <Tag color={conclusion.color}>{conclusion.label}</Tag>}
            <Tag>{formatReviewTraceCode(job.id)}</Tag>
          </Space>
          <Typography.Title
            level={3}
            className="labelhub-ai-review-selected-title"
            title={job.taskTitle || "未命名任务"}
          >
            {job.taskTitle || "未命名任务"}
          </Typography.Title>
          <Typography.Text type="secondary">
            提交 {formatReviewTraceCode(job.submissionId)} · {formatSubmissionVersion(job.submissionVersion)} ·{" "}
            {formatReviewConfigVersion(job.reviewConfigVersionNo)}
          </Typography.Text>
        </div>
        <div className="labelhub-ai-review-selected-actions">
          <Typography.Text type="secondary" className="labelhub-ai-review-selected-time">
            <ClockCircleOutlined /> 更新 {formatTaskTime(job.updatedAt)}
          </Typography.Text>
          <Flex gap={8} justify="flex-end" align="center" wrap="wrap">
            {job.reviewId ? (
              <Button type="primary" ghost onClick={() => navigate(buildReviewerReviewDetailPath(job.reviewId as string))}>
                查看人工审核详情
              </Button>
            ) : (
              <Tag color="blue">等待写回审核记录</Tag>
            )}
            {detail && <Tag color={detail.review.aiIssueCount > 0 ? "orange" : "green"}>问题 {detail.review.aiIssueCount}</Tag>}
          </Flex>
        </div>
      </div>
    </Card>
  );
}

function getAgentHealthView(summary: ReviewJobSummaryVO | null): { label: string; healthLine: string; color: string; tone: "green" | "orange" } {
  if ((summary?.activeWorkerCount ?? 0) > 0) {
    return {
      label: `运行中 ${summary?.activeWorkerCount ?? 0}`,
      healthLine: "处理中",
      color: "processing",
      tone: "green",
    };
  }
  if ((summary?.staleRunningJobCount ?? 0) > 0) {
    return {
      label: `有超时待回收 ${summary?.staleRunningJobCount ?? 0}`,
      healthLine: "待回收",
      color: "orange",
      tone: "orange",
    };
  }
  return {
    label: "服务在线",
    healthLine: "在线",
    color: "green",
    tone: "green",
  };
}

function MetricPill({ label, value, active = false }: { label: string; value: number; active?: boolean }) {
  return (
    <div className="labelhub-ai-review-metric-pill" data-active={active}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HealthLine({ label, value, tone }: { label: string; value: string; tone?: "green" | "orange" }) {
  return (
    <Flex align="center" justify="space-between" gap={10}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Space size={6}>
        {tone && <span className={`labelhub-ai-review-dot labelhub-ai-review-dot-${tone}`} />}
        <Typography.Text strong>{value}</Typography.Text>
      </Space>
    </Flex>
  );
}
