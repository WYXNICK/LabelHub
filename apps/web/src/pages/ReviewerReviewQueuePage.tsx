import {
  ApiOutlined,
  AuditOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Input, Select, Space, Statistic, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listReviewJobs, listReviews } from "../features/reviews/api";
import type { ReviewJobStatus, ReviewJobVO, ReviewVO } from "../features/reviews/types";
import { reviewJobStatusMeta, reviewStatusMeta, truncateMiddle } from "../features/reviews/view";
import { formatTaskTime } from "../features/tasks/view";

const statusOptions: Array<{ label: string; value: ReviewJobStatus | "ALL" }> = [
  { label: "全部状态", value: "ALL" },
  { label: "等待 AI 预审", value: "QUEUED" },
  { label: "AI 处理中", value: "RUNNING" },
  { label: "等待重试", value: "FAILED" },
  { label: "人工兜底", value: "NEEDS_HUMAN_REVIEW" },
  { label: "预审完成", value: "SUCCEEDED" },
];

interface QueueState {
  jobs: ReviewJobVO[];
  reviews: ReviewVO[];
  totalJobs: number;
  totalReviews: number;
}

export function ReviewerReviewQueuePage() {
  const [status, setStatus] = useState<ReviewJobStatus | "ALL">("ALL");
  const [taskId, setTaskId] = useState("");
  const [state, setState] = useState<QueueState>({ jobs: [], reviews: [], totalJobs: 0, totalReviews: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobPage, reviewPage] = await Promise.all([
        listReviewJobs({
          page: 1,
          pageSize: 20,
          status: status === "ALL" ? undefined : status,
          taskId: taskId.trim() || undefined,
        }),
        listReviews({ page: 1, pageSize: 8 }),
      ]);
      setState({
        jobs: jobPage.data,
        reviews: reviewPage.data,
        totalJobs: jobPage.pagination.totalItems,
        totalReviews: reviewPage.pagination.totalItems,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核队列暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [status, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => buildJobStats(state.jobs), [state.jobs]);

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 6 }}>
            审核工作台
          </Typography.Title>
          <Typography.Text type="secondary">
            阶段 4.1 已接入提交入队与 AI 预审任务跟踪；人工通过、打回和批量审核将在后续粒度启用。
          </Typography.Text>
        </div>
        <Space>
          <Tag color="blue">Phase 4.1</Tag>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        </Space>
      </Flex>

      <div className="labelhub-reviewer-summary-grid">
        <Card className="labelhub-stat-card">
          <Statistic title="预审任务" value={state.totalJobs} prefix={<ThunderboltOutlined />} />
          <Typography.Text type="secondary">来自 Labeler 正式提交</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="等待处理" value={stats.pending} valueStyle={{ color: "#245bdb" }} />
          <Typography.Text type="secondary">等待 Agent 领取或重试</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="处理中" value={stats.running} valueStyle={{ color: "#d46b08" }} />
          <Typography.Text type="secondary">已被系统 Agent 锁定</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="待人工记录" value={state.totalReviews} valueStyle={{ color: "#13a867" }} />
          <Typography.Text type="secondary">AI 写回后进入 Reviewer 队列</Typography.Text>
        </Card>
      </div>

      <Card className="labelhub-reviewer-filter-card">
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Space wrap>
            <Input
              allowClear
              id="review-job-task-id-filter"
              name="taskId"
              aria-label="按任务 ID 精确筛选"
              placeholder="按任务 ID 精确筛选"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              style={{ width: 260 }}
            />
            <Select value={status} options={statusOptions} onChange={setStatus} style={{ width: 180 }} />
            <Button type="primary" ghost onClick={() => void load()}>
              查询
            </Button>
          </Space>
          <Typography.Text type="secondary">AI 结论只作为建议展示，最终通过/打回必须由人工审核落定。</Typography.Text>
        </Flex>
      </Card>

      {error && <Alert showIcon type="warning" message="审核队列加载失败" description={error} />}

      <div className="labelhub-reviewer-workbench-grid">
        <Card className="labelhub-reviewer-queue-card" title="AI 预审任务队列" loading={loading}>
          {state.jobs.length === 0 ? (
            <Empty description="暂无预审任务。Labeler 提交后会自动入队。" />
          ) : (
            <div className="labelhub-reviewer-job-list">
              {state.jobs.map((job) => (
                <ReviewJobRow key={job.id} job={job} />
              ))}
            </div>
          )}
        </Card>

        <Space direction="vertical" size={16} className="labelhub-reviewer-side">
          <Card title="运行说明">
            <Space direction="vertical" size={12}>
              <StepLine icon={<DatabaseOutlined />} title="提交入队" description="每个提交版本只创建一个有效 review job。" />
              <StepLine icon={<ApiOutlined />} title="Agent 领取" description="阶段 4.2 会由 uv 管理的 Agent 调用 OpenAI 兼容接口。" />
              <StepLine icon={<AuditOutlined />} title="人工终审" description="AI 结果写回后进入 Reviewer 人工审核，不自动终审。" />
            </Space>
          </Card>

          <Card title="最近待审记录">
            {state.reviews.length === 0 ? (
              <Typography.Text type="secondary">AI 结果写回后，这里会展示可人工处理的审核记录。</Typography.Text>
            ) : (
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                {state.reviews.map((review) => (
                  <div key={review.id} className="labelhub-reviewer-review-mini">
                    <Flex justify="space-between" gap={8}>
                      <Typography.Text strong>{truncateMiddle(review.id, 12, 8)}</Typography.Text>
                      <Tag color={reviewStatusMeta[review.status].color}>{reviewStatusMeta[review.status].label}</Tag>
                    </Flex>
                    <Typography.Text type="secondary">提交 {truncateMiddle(review.submissionId, 12, 8)}</Typography.Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Space>
      </div>
    </Space>
  );
}

function ReviewJobRow({ job }: { job: ReviewJobVO }) {
  const meta = reviewJobStatusMeta[job.status];
  return (
    <div className="labelhub-reviewer-job-row" data-tone={meta.tone}>
      <div className="labelhub-reviewer-job-main">
        <Flex align="center" gap={10} wrap="wrap">
          <Typography.Text strong>{truncateMiddle(job.id, 16, 10)}</Typography.Text>
          <Tag color={meta.color}>{meta.label}</Tag>
        </Flex>
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: "6px 0 0" }}>
          任务 {truncateMiddle(job.taskId, 12, 8)} · 提交 {truncateMiddle(job.submissionId, 12, 8)} · 审核配置{" "}
          {truncateMiddle(job.reviewConfigVersionId, 12, 8)}
        </Typography.Paragraph>
      </div>
      <div className="labelhub-reviewer-job-meta">
        <span>
          <ClockCircleOutlined /> 创建 {formatTaskTime(job.createdAt)}
        </span>
        <span>
          尝试 {job.attemptCount}/{job.maxAttempts}
        </span>
        <span>幂等键 {truncateMiddle(job.idempotencyKey, 16, 10)}</span>
      </div>
    </div>
  );
}

function StepLine({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="labelhub-reviewer-step">
      <span>{icon}</span>
      <div>
        <Typography.Text strong>{title}</Typography.Text>
        <br />
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
    </div>
  );
}

function buildJobStats(jobs: ReviewJobVO[]) {
  return jobs.reduce(
    (acc, job) => {
      if (job.status === "QUEUED" || job.status === "FAILED") {
        acc.pending += 1;
      }
      if (job.status === "RUNNING") {
        acc.running += 1;
      }
      return acc;
    },
    { pending: 0, running: 0 },
  );
}
