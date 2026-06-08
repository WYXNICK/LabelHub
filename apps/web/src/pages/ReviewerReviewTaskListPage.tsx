import {
  ArrowRightOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Input, Pagination, Progress, Select, Space, Statistic, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { listReviewTasks } from "../features/reviews/api";
import type { AiReviewConclusion, ReviewStatus, ReviewTaskSummaryVO } from "../features/reviews/types";
import {
  aiConclusionMeta,
  buildReviewerReviewTaskPath,
  formatReviewConfigVersion,
  formatReviewTraceCode,
  reviewStatusMeta,
} from "../features/reviews/view";
import { formatTaskTime } from "../features/tasks/view";

const reviewTaskPageSize = 12;
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

interface ReviewTaskState {
  tasks: ReviewTaskSummaryVO[];
  totalTasks: number;
}

export function ReviewerReviewTaskListPage() {
  const [status, setStatus] = useState<ReviewStatus | "ALL">("PENDING_HUMAN_REVIEW");
  const [aiConclusion, setAiConclusion] = useState<AiReviewConclusion | "ALL">("ALL");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<ReviewTaskState>({ tasks: [], totalTasks: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listReviewTasks({
        page,
        pageSize: reviewTaskPageSize,
        status: status === "ALL" ? undefined : status,
        aiConclusion: aiConclusion === "ALL" ? undefined : aiConclusion,
        keyword: keyword.trim() || undefined,
      });
      setState({ tasks: result.data, totalTasks: result.pagination.totalItems });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "人工审核任务列表暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [aiConclusion, keyword, page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => buildTaskSummary(state.tasks), [state.tasks]);

  const triggerSearch = () => {
    const nextKeyword = keywordInput.trim();
    setPage(1);
    setKeyword(nextKeyword);
    if (page === 1 && keyword === nextKeyword) {
      void load();
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 6 }}>
            人工审核任务
          </Typography.Title>
          <Typography.Text type="secondary">
            先选择任务，再进入任务内复审/终审工作台；批量操作、轮次 diff、AI 评语和关键流转时间线都在任务上下文中完成。
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<ThunderboltOutlined />} onClick={() => navigate("/reviewer/ai-review-queue")}>
            AI 预审队列
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        </Space>
      </Flex>

      {error && <Alert showIcon type="warning" message="人工审核任务加载失败" description={error} />}

      <div className="labelhub-review-task-summary-grid">
        <Card className="labelhub-review-task-stat-card">
          <Statistic title="任务数" value={state.totalTasks} prefix={<AuditOutlined />} />
          <Typography.Text type="secondary">当前筛选下需要关注的任务</Typography.Text>
        </Card>
        <Card className="labelhub-review-task-stat-card">
          <Statistic title="待人工审核" value={summary.pending} prefix={<AuditOutlined />} />
          <Typography.Text type="secondary">进入任务工作台后可批量处理</Typography.Text>
        </Card>
        <Card className="labelhub-review-task-stat-card">
          <Statistic title="AI 建议通过" value={summary.aiPass} valueStyle={{ color: "#13a867" }} prefix={<CheckCircleOutlined />} />
          <Typography.Text type="secondary">优先抽查和终审确认</Typography.Text>
        </Card>
        <Card className="labelhub-review-task-stat-card">
          <Statistic title="AI 建议打回/转人工" value={summary.risk} valueStyle={{ color: "#d46b08" }} prefix={<CloseCircleOutlined />} />
          <Typography.Text type="secondary">优先核对问题字段与原因</Typography.Text>
        </Card>
      </div>

      <Card className="labelhub-review-task-filter-card">
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Space wrap>
            <Input
              allowClear
              aria-label="搜索任务标题或 ID"
              prefix={<SearchOutlined />}
              placeholder="搜索任务标题或 ID"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onPressEnter={triggerSearch}
              style={{ width: 260 }}
            />
            <Select
              value={status}
              options={reviewStatusOptions}
              onChange={(value) => {
                setPage(1);
                setStatus(value);
              }}
              style={{ width: 160 }}
            />
            <Select
              value={aiConclusion}
              options={aiConclusionOptions}
              onChange={(value) => {
                setPage(1);
                setAiConclusion(value);
              }}
              style={{ width: 160 }}
            />
            <Button type="primary" ghost onClick={triggerSearch}>
              查询
            </Button>
          </Space>
          <Typography.Text type="secondary">人工审核以任务为单位组织，避免跨任务批量误操作。</Typography.Text>
        </Flex>
      </Card>

      <Card className="labelhub-review-task-table-card" loading={loading}>
        {state.tasks.length === 0 ? (
          <Empty description="当前筛选下暂无人工审核任务。" />
        ) : (
          <div className="labelhub-review-task-table">
            <div className="labelhub-review-task-table-head">
              <span>任务</span>
              <span>审核进度</span>
              <span>AI 建议</span>
              <span>最近更新</span>
              <span>操作</span>
            </div>
            {state.tasks.map((task) => (
              <ReviewTaskRow key={task.taskId} task={task} />
            ))}
          </div>
        )}
        {state.totalTasks > reviewTaskPageSize && (
          <Flex justify="flex-end" style={{ paddingTop: 14 }}>
            <Pagination
              current={page}
              pageSize={reviewTaskPageSize}
              total={state.totalTasks}
              showSizeChanger={false}
              showTotal={(total) => `共 ${total} 个任务`}
              onChange={setPage}
            />
          </Flex>
        )}
      </Card>
    </Space>
  );
}

function ReviewTaskRow({ task }: { task: ReviewTaskSummaryVO }) {
  const progressPercent = task.totalReviewCount > 0 ? Math.round(((task.approvedCount + task.returnedCount) / task.totalReviewCount) * 100) : 0;
  return (
    <div className="labelhub-review-task-row">
      <div className="labelhub-review-task-main">
        <Typography.Text strong className="labelhub-review-task-title" title={task.taskTitle || "未命名任务"}>
          {task.taskTitle || "未命名任务"}
        </Typography.Text>
        <Space size={[6, 6]} wrap>
          <Tag color={task.pendingReviewCount > 0 ? reviewStatusMeta.PENDING_HUMAN_REVIEW.color : "green"}>
            待审 {task.pendingReviewCount}
          </Tag>
          <Tag>{formatReviewConfigVersion(task.reviewConfigVersionNo)}</Tag>
          {task.latestReviewId && <Tag>{formatReviewTraceCode(task.latestReviewId)}</Tag>}
        </Space>
      </div>
      <div className="labelhub-review-task-progress">
        <Flex align="center" justify="space-between" gap={8}>
          <Typography.Text>已处理 {task.approvedCount + task.returnedCount} / {task.totalReviewCount}</Typography.Text>
          <Typography.Text type="secondary">{progressPercent}%</Typography.Text>
        </Flex>
        <Progress percent={progressPercent} showInfo={false} size="small" />
      </div>
      <Space size={[6, 6]} wrap>
        <Tag color="green">通过 {task.aiPassCount}</Tag>
        <Tag color="orange">打回 {task.aiReturnCount}</Tag>
        <Tag color="purple">转人工 {task.aiManualCount}</Tag>
      </Space>
      <Typography.Text type="secondary">
        {task.latestReviewUpdatedAt ? formatTaskTime(task.latestReviewUpdatedAt) : "暂无"}
      </Typography.Text>
      <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate(buildReviewerReviewTaskPath(task.taskId))}>
        进入审核
      </Button>
    </div>
  );
}

function buildTaskSummary(tasks: ReviewTaskSummaryVO[]) {
  return tasks.reduce(
    (acc, task) => {
      acc.pending += task.pendingReviewCount;
      acc.aiPass += task.aiPassCount;
      acc.risk += task.aiReturnCount + task.aiManualCount;
      return acc;
    },
    { pending: 0, aiPass: 0, risk: 0 },
  );
}
