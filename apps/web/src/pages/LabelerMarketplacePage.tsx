import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  GiftOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Pagination,
  Progress,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { claimAssignment, listMarketplaceTasks } from "../features/assignments/api";
import type { MarketplaceTaskVO } from "../features/assignments/types";
import {
  buildClaimIdempotencyKey,
  formatRewardRule,
  getClaimButtonText,
  summarizeMarketplace,
} from "../features/assignments/view";
import { formatTaskTime } from "../features/tasks/view";
import { ApiClientError } from "../shared/api/client";
import type { PaginationVO } from "../shared/types/api";

const emptyPagination: PaginationVO = {
  page: 1,
  pageSize: 6,
  totalItems: 0,
  totalPages: 0,
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

function getClaimProgress(task: MarketplaceTaskVO): number {
  if (task.quota <= 0) {
    return 0;
  }
  return Math.min(Math.round((task.claimedCount / task.quota) * 100), 100);
}

export function LabelerMarketplacePage() {
  const { message } = AntdApp.useApp();
  const [tasks, setTasks] = useState<MarketplaceTaskVO[]>([]);
  const [pagination, setPagination] = useState<PaginationVO>(emptyPagination);
  const [keyword, setKeyword] = useState("");
  const [tag, setTag] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [submittedTag, setSubmittedTag] = useState("");
  const [queryState, setQueryState] = useState({ page: 1, pageSize: 6, requestId: 0 });
  const [loading, setLoading] = useState(false);
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => summarizeMarketplace(tasks), [tasks]);

  const fetchMarketplace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listMarketplaceTasks({
        page: queryState.page,
        pageSize: queryState.pageSize,
        keyword: submittedKeyword.trim() || undefined,
        tag: submittedTag.trim() || undefined,
      });
      setTasks(response.data);
      setPagination(response.pagination);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [queryState.page, queryState.pageSize, submittedKeyword, submittedTag]);

  useEffect(() => {
    void fetchMarketplace();
  }, [fetchMarketplace, queryState.requestId]);

  function submitQuery() {
    setSubmittedKeyword(keyword);
    setSubmittedTag(tag);
    setQueryState((current) => ({ page: 1, pageSize: current.pageSize, requestId: current.requestId + 1 }));
  }

  function reloadCurrentPage() {
    setQueryState((current) => ({ ...current, requestId: current.requestId + 1 }));
  }

  async function handleClaim(task: MarketplaceTaskVO) {
    setClaimingTaskId(task.id);
    try {
      const assignment = await claimAssignment(task.id, {
        idempotencyKey: buildClaimIdempotencyKey(task.id),
      });
      message.success(`已领取题目，领取单 ${assignment.id.slice(0, 18)} 已创建`);
      reloadCurrentPage();
    } catch (requestError) {
      message.error(getErrorMessage(requestError));
    } finally {
      setClaimingTaskId(null);
    }
  }

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 8 }}>
            任务广场
          </Typography.Title>
          <Typography.Text type="secondary">
            浏览已发布且可领取的标注任务。领取时会锁定一个题目，并绑定当前模板版本与审核配置。
          </Typography.Text>
        </div>
        <Tag color="blue">阶段 3.1 · 先到先得</Tag>
      </Flex>

      <div className="labelhub-market-summary-grid" aria-busy={loading}>
        <Card>
          <Statistic title="可领取任务" value={pagination.totalItems || summary.taskCount} />
          <Typography.Text type="secondary">后端已过滤不可领取任务</Typography.Text>
        </Card>
        <Card>
          <Statistic title="当前页剩余题目" value={summary.availableItemCount} valueStyle={{ color: "#245bdb" }} />
          <Typography.Text type="secondary">按任务配额和未领取题目共同计算</Typography.Text>
        </Card>
        <Card>
          <Statistic title="我已领取" value={summary.claimedByMeCount} />
          <Typography.Text type="secondary">包含待作答、返修和已通过题目</Typography.Text>
        </Card>
        <Card>
          <Statistic title="我已提交" value={summary.submittedByMeCount} />
          <Typography.Text type="secondary">正式提交后会自动累计</Typography.Text>
        </Card>
      </div>

      <Card>
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Space wrap>
            <Input
              id="labeler-marketplace-keyword"
              name="labelerMarketplaceKeyword"
              autoComplete="off"
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索任务标题或描述"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={submitQuery}
              style={{ width: 280 }}
            />
            <Input
              id="labeler-marketplace-tag"
              name="labelerMarketplaceTag"
              autoComplete="off"
              allowClear
              placeholder="按标签筛选，如 qa_quality"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              onPressEnter={submitQuery}
              style={{ width: 220 }}
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

      <div className="labelhub-market-grid">
        {tasks.map((task) => (
          <Card key={task.id} className="labelhub-market-task-card" loading={loading}>
            <Flex justify="space-between" align="flex-start" gap={14}>
              <Space direction="vertical" size={8} style={{ minWidth: 0 }}>
                <Space size={8} wrap>
                  <Tag color="processing">可领取 {formatMetric(task.availableItemCount)}</Tag>
                  {task.claimedByMeCount > 0 && <Tag color="green">我已领 {task.claimedByMeCount}</Tag>}
                </Space>
                <Typography.Title level={4} className="labelhub-market-title">
                  {task.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" className="labelhub-market-description">
                  {task.description || "暂无任务描述"}
                </Typography.Paragraph>
              </Space>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={claimingTaskId === task.id}
                disabled={task.availableItemCount <= 0}
                onClick={() => void handleClaim(task)}
              >
                {getClaimButtonText(task)}
              </Button>
            </Flex>

            <Space size={6} wrap className="labelhub-market-tags">
              {task.tags.length > 0 ? task.tags.map((item) => <Tag key={item}>{item}</Tag>) : <Tag>未设置标签</Tag>}
            </Space>

            <div className="labelhub-market-meta-grid">
              <div>
                <ClockCircleOutlined />
                <span>截止 {formatTaskTime(task.deadlineAt)}</span>
              </div>
              <div>
                <GiftOutlined />
                <span>{formatRewardRule(task.rewardRule)}</span>
              </div>
              <div>
                <CheckCircleOutlined />
                <span>
                  提交 {formatMetric(task.submittedCount)} / 通过 {formatMetric(task.approvedCount)}
                </span>
              </div>
            </div>

            <div className="labelhub-market-progress">
              <Flex justify="space-between">
                <Typography.Text type="secondary">领取进度</Typography.Text>
                <Typography.Text type="secondary">
                  {formatMetric(task.claimedCount)} / {formatMetric(task.quota)}
                </Typography.Text>
              </Flex>
              <Progress percent={getClaimProgress(task)} size="small" showInfo={false} />
            </div>
          </Card>
        ))}
      </div>

      {!loading && tasks.length === 0 && (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无可领取任务，稍后刷新或调整筛选条件。"
          />
        </Card>
      )}

      <Flex justify="flex-end">
        <Pagination
          current={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.totalItems}
          showSizeChanger
          pageSizeOptions={[6, 12, 24]}
          showTotal={(total) => `共 ${total} 个可领取任务`}
          onChange={(page, pageSize) =>
            setQueryState((current) => ({ page, pageSize, requestId: current.requestId + 1 }))
          }
        />
      </Flex>
    </Space>
  );
}
