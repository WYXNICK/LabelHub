import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  FileDoneOutlined,
  ReloadOutlined,
  SearchOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Pagination,
  Segmented,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { getContributionStats, listContributions } from "../features/assignments/api";
import type { ContributionBucket, ContributionItemVO, ContributionStatsVO } from "../features/assignments/types";
import {
  assignmentStatusMeta,
  contributionBucketTabs,
  formatContributionVersion,
  getContributionAction,
} from "../features/assignments/view";
import { formatTaskTime } from "../features/tasks/view";
import { ApiClientError } from "../shared/api/client";
import type { PaginationVO } from "../shared/types/api";

const emptyStats: ContributionStatsVO = {
  totalAssignments: 0,
  draftCount: 0,
  inReviewCount: 0,
  submittedCount: 0,
  approvedCount: 0,
  returnedCount: 0,
  revisionRequiredCount: 0,
  totalSubmissionCount: 0,
  passRate: 0,
  latestUpdatedAt: null,
};

const emptyPagination: PaginationVO = {
  page: 1,
  pageSize: 8,
  totalItems: 0,
  totalPages: 0,
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

function formatMetric(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatPassRate(value: number): string {
  return value > 0 ? `${value.toFixed(1)}%` : "暂无";
}

function getContributionTime(item: ContributionItemVO): string {
  return item.submittedAt ?? item.draftSavedAt ?? item.updatedAt;
}

export function LabelerContributionsPage() {
  const [stats, setStats] = useState<ContributionStatsVO>(emptyStats);
  const [items, setItems] = useState<ContributionItemVO[]>([]);
  const [pagination, setPagination] = useState<PaginationVO>(emptyPagination);
  const [bucket, setBucket] = useState<ContributionBucket>("ALL");
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [queryState, setQueryState] = useState({ page: 1, pageSize: 8, requestId: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingCount = useMemo(() => stats.draftCount + stats.revisionRequiredCount, [stats]);

  const fetchContributions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsResponse, listResponse] = await Promise.all([
        getContributionStats(),
        listContributions({
          page: queryState.page,
          pageSize: queryState.pageSize,
          bucket,
          keyword: submittedKeyword.trim() || undefined,
        }),
      ]);
      setStats(statsResponse);
      setItems(listResponse.data);
      setPagination(listResponse.pagination);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [bucket, queryState.page, queryState.pageSize, submittedKeyword]);

  useEffect(() => {
    void fetchContributions();
  }, [fetchContributions, queryState.requestId]);

  function submitQuery() {
    setSubmittedKeyword(keyword);
    setQueryState((current) => ({ page: 1, pageSize: current.pageSize, requestId: current.requestId + 1 }));
  }

  function changeBucket(nextBucket: ContributionBucket) {
    setBucket(nextBucket);
    setQueryState((current) => ({ page: 1, pageSize: current.pageSize, requestId: current.requestId + 1 }));
  }

  function reloadCurrentPage() {
    setQueryState((current) => ({ ...current, requestId: current.requestId + 1 }));
  }

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 8 }}>
            我的贡献
          </Typography.Title>
          <Typography.Text type="secondary">
            汇总已领取题目的提交、通过、打回和待修改状态，返修项会保留上一轮审核意见和历史提交版本。
          </Typography.Text>
        </div>
        <Space wrap>
          <Tag color="blue">阶段 3.5 · 我的数据</Tag>
          <Button icon={<ReloadOutlined />} onClick={reloadCurrentPage}>
            刷新
          </Button>
        </Space>
      </Flex>

      <div className="labelhub-contribution-summary-grid" aria-busy={loading}>
        <Card className="labelhub-stat-card">
          <Statistic title="已提交" value={stats.submittedCount} prefix={<FileDoneOutlined />} />
          <Typography.Text type="secondary">累计正式提交 {formatMetric(stats.totalSubmissionCount)} 次</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="已通过" value={stats.approvedCount} prefix={<CheckCircleOutlined />} />
          <Typography.Text type="secondary">审核通过率 {formatPassRate(stats.passRate)}</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="待处理" value={pendingCount} prefix={<ClockCircleOutlined />} />
          <Typography.Text type="secondary">待提交 {stats.draftCount} · 待修改 {stats.revisionRequiredCount}</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="打回" value={stats.returnedCount} prefix={<UndoOutlined />} />
          <Typography.Text type="secondary">
            最近更新 {stats.latestUpdatedAt ? formatTaskTime(stats.latestUpdatedAt) : "暂无"}
          </Typography.Text>
        </Card>
      </div>

      <Card className="labelhub-contribution-filter-card">
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Space wrap>
            <Input
              id="labeler-contribution-keyword"
              name="labelerContributionKeyword"
              autoComplete="off"
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索任务标题或题目 ID"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={submitQuery}
              style={{ width: 300 }}
            />
            <Button type="primary" onClick={submitQuery}>
              查询
            </Button>
          </Space>
          <Segmented
            value={bucket}
            options={contributionBucketTabs.map((tab) => ({ label: tab.label, value: tab.key }))}
            onChange={(value) => changeBucket(value as ContributionBucket)}
          />
        </Flex>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}

      <Card className="labelhub-contribution-list-card" loading={loading}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {items.map((item) => {
            const statusMeta = assignmentStatusMeta[item.status];
            const action = getContributionAction(item);
            return (
              <article key={item.assignmentId} className="labelhub-contribution-row">
                <div className="labelhub-contribution-row-main">
                  <Flex align="center" gap={8} wrap="wrap">
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {item.taskTitle}
                    </Typography.Title>
                    <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                    <Tag>{formatContributionVersion(item)}</Tag>
                  </Flex>
                  <Typography.Paragraph type="secondary" className="labelhub-contribution-description">
                    {item.taskDescription || item.datasetItemPreview || "暂无题目摘要"}
                  </Typography.Paragraph>
                  <Space size={6} wrap>
                    <Tag>{item.datasetItemId.slice(0, 18)}</Tag>
                    <Typography.Text type="secondary">更新于 {formatTaskTime(item.updatedAt)}</Typography.Text>
                    <Typography.Text type="secondary">关键时间 {formatTaskTime(getContributionTime(item))}</Typography.Text>
                  </Space>
                  {item.reviewFeedback && (
                    <Alert
                      className="labelhub-contribution-feedback"
                      type="warning"
                      showIcon
                      message="打回原因"
                      description={item.reviewFeedback.reason}
                    />
                  )}
                </div>
                <Space className="labelhub-contribution-row-action">
                  <Button
                    type={item.canRevise ? "primary" : item.canContinue ? "default" : "link"}
                    icon={item.canRevise ? <EditOutlined /> : undefined}
                    onClick={() => navigate(action.path)}
                  >
                    {action.label}
                  </Button>
                </Space>
              </article>
            );
          })}

          {!loading && items.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无贡献记录，先去任务广场领取并提交题目。"
              style={{ padding: "48px 0" }}
            />
          )}
        </Space>
      </Card>

      <Flex justify="flex-end">
        <Pagination
          current={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.totalItems}
          showSizeChanger
          pageSizeOptions={[8, 16, 32]}
          showTotal={(total) => `共 ${total} 条贡献记录`}
          onChange={(page, pageSize) =>
            setQueryState((current) => ({ page, pageSize, requestId: current.requestId + 1 }))
          }
        />
      </Flex>
    </Space>
  );
}
