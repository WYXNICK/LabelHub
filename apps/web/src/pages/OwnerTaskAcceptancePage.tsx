import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Progress, Skeleton, Space, Statistic, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { getTaskAcceptanceStats } from "../features/reviews/api";
import type { AcceptanceStatsVO } from "../features/reviews/types";
import {
  aiConclusionMeta,
  formatAiScoreTotal,
  formatSubmissionVersion,
  reviewStatusMeta,
} from "../features/reviews/view";
import { getTask } from "../features/tasks/api";
import type { TaskDetailVO } from "../features/tasks/types";
import { formatTaskTime } from "../features/tasks/view";

interface OwnerTaskAcceptancePageProps {
  taskId: string;
}

export function OwnerTaskAcceptancePage({ taskId }: OwnerTaskAcceptancePageProps) {
  const [task, setTask] = useState<TaskDetailVO | null>(null);
  const [stats, setStats] = useState<AcceptanceStatsVO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextTask, nextStats] = await Promise.all([getTask(taskId), getTaskAcceptanceStats(taskId)]);
      setTask(nextTask);
      setStats(nextStats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "数据验收信息暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 12 }} />;
  }

  if (error) {
    return <Alert showIcon type="warning" message="数据验收加载失败" description={error} />;
  }

  if (!task || !stats) {
    return <Empty description="未找到任务验收数据" />;
  }

  return <OwnerTaskAcceptanceContent task={task} stats={stats} onReload={load} />;
}

function OwnerTaskAcceptanceContent({
  task,
  stats,
  onReload,
}: {
  task: TaskDetailVO;
  stats: AcceptanceStatsVO;
  onReload: () => void;
}) {
  const reviewedCount = stats.approvedCount + stats.returnedCount;
  const passRate = reviewedCount > 0 ? Math.round((stats.approvedCount / reviewedCount) * 1000) / 10 : 0;
  const returnRate = reviewedCount > 0 ? Math.round((stats.returnedCount / reviewedCount) * 1000) / 10 : 0;
  const conclusionRows = useMemo(
    () =>
      (Object.keys(aiConclusionMeta) as Array<keyof typeof aiConclusionMeta>).map((key) => ({
        key,
        count: stats.aiConclusionDistribution[key] ?? 0,
      })),
    [stats.aiConclusionDistribution],
  );
  const maxConclusionCount = Math.max(1, ...conclusionRows.map((item) => item.count));

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Space wrap style={{ marginBottom: 12 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/owner/tasks")}>
              返回任务管理
            </Button>
            <Tag color="blue">数据验收</Tag>
            {stats.latestReviewedAt && <Tag color="green">最近审核 {formatTaskTime(stats.latestReviewedAt)}</Tag>}
          </Space>
          <Typography.Title level={2} style={{ marginBottom: 6 }}>
            {task.title}
          </Typography.Title>
          <Typography.Text type="secondary">
            汇总任务提交、人工审核结论与 AI 预审分布，用于判断数据是否已经具备进入导出阶段的质量基础。
          </Typography.Text>
        </div>
        <Space wrap>
          <Button onClick={() => navigate(`/owner/tasks/${task.id}/datasets`)}>查看数据集</Button>
          <Button onClick={() => navigate(`/owner/tasks/${task.id}/review-config`)}>审核配置</Button>
          <Button icon={<ReloadOutlined />} onClick={() => void onReload()}>
            刷新
          </Button>
        </Space>
      </Flex>

      <div className="labelhub-acceptance-summary-grid">
        <Card className="labelhub-stat-card">
          <Statistic title="累计提交" value={stats.submittedCount} prefix={<ClockCircleOutlined />} />
          <Typography.Text type="secondary">任务已收到的提交版本数</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="待人工审核" value={stats.pendingReviewCount} valueStyle={{ color: "#3370ff" }} />
          <Typography.Text type="secondary">仍在 Reviewer 队列中等待终审</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="通过率" value={passRate} suffix="%" prefix={<CheckCircleOutlined />} valueStyle={{ color: "#13a867" }} />
          <Typography.Text type="secondary">通过 {stats.approvedCount} / 已终审 {reviewedCount}</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="打回率" value={returnRate} suffix="%" prefix={<CloseCircleOutlined />} valueStyle={{ color: "#d46b08" }} />
          <Typography.Text type="secondary">打回 {stats.returnedCount} / 已终审 {reviewedCount}</Typography.Text>
        </Card>
      </div>

      <div className="labelhub-acceptance-grid">
        <Card title="AI 结论分布" className="labelhub-acceptance-card">
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            {conclusionRows.map((item) => {
              const meta = aiConclusionMeta[item.key];
              return (
                <div key={item.key} className="labelhub-acceptance-distribution-row">
                  <Flex justify="space-between" align="center" gap={12}>
                    <Space>
                      <Tag color={meta.color}>{meta.label}</Tag>
                      <Typography.Text type="secondary">{item.count} 条</Typography.Text>
                    </Space>
                    <Typography.Text strong>{Math.round((item.count / maxConclusionCount) * 100)}%</Typography.Text>
                  </Flex>
                  <Progress percent={(item.count / maxConclusionCount) * 100} showInfo={false} strokeColor="#3370ff" />
                </div>
              );
            })}
          </Space>
        </Card>

        <Card title="验收判断" className="labelhub-acceptance-card">
          <Space direction="vertical" size={12}>
            <Alert
              type={stats.pendingReviewCount > 0 ? "info" : stats.submittedCount === 0 ? "warning" : "success"}
              showIcon
              message={stats.pendingReviewCount > 0 ? "仍有待审数据" : stats.submittedCount === 0 ? "暂无提交" : "当前审核已闭环"}
              description={
                stats.pendingReviewCount > 0
                  ? "建议先完成 Reviewer 人工终审，再进入后续导出和验收材料整理。"
                  : stats.submittedCount === 0
                    ? "请先完成任务发布、标注领取和提交，再查看数据质量分布。"
                    : "当前任务的已提交数据均已完成人工结论，可继续抽样复核或进入导出阶段。"
              }
            />
            <Typography.Text type="secondary">
              该页面只汇总 Owner 视角验收信息，不会改变审核状态；最终通过和打回仍由 Reviewer 工作台执行。
            </Typography.Text>
          </Space>
        </Card>
      </div>

      <Card title="最近审核样本" extra={<Tag>{stats.recentReviews.length} 条</Tag>}>
        {stats.recentReviews.length === 0 ? (
          <Empty description="暂无审核样本，等待标注员提交并完成 AI 预审。" />
        ) : (
          <div className="labelhub-acceptance-review-list">
            {stats.recentReviews.map((review) => (
              <div key={review.reviewId} className="labelhub-acceptance-review-row">
                <div>
                  <Flex align="center" gap={8} wrap="wrap">
                    <Typography.Text strong>{review.taskTitle || task.title}</Typography.Text>
                    <Tag color={reviewStatusMeta[review.status].color}>{reviewStatusMeta[review.status].label}</Tag>
                    {review.aiConclusion && <Tag color={aiConclusionMeta[review.aiConclusion].color}>{aiConclusionMeta[review.aiConclusion].label}</Tag>}
                  </Flex>
                  <Space size={[6, 6]} wrap style={{ marginTop: 8 }}>
                    <Tag color="blue">{formatSubmissionVersion(review.submissionVersion)}</Tag>
                    <Tag>第 {review.reviewRound} 轮</Tag>
                    <Tag>总分 {formatAiScoreTotal(review.aiScoreTotal)}</Tag>
                    <Tag color={review.aiIssueCount > 0 ? "orange" : "green"}>问题 {review.aiIssueCount}</Tag>
                  </Space>
                  {review.humanComment && (
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: "8px 0 0" }}>
                      人工意见：{review.humanComment}
                    </Typography.Paragraph>
                  )}
                </div>
                <Typography.Text type="secondary">更新 {formatTaskTime(review.updatedAt)}</Typography.Text>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Space>
  );
}
