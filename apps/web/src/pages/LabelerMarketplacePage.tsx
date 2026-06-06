import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileDoneOutlined,
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

import { navigate } from "../app/routes";
import { claimAssignment, listMarketplaceTasks } from "../features/assignments/api";
import type { MarketplaceTaskVO } from "../features/assignments/types";
import {
  buildClaimIdempotencyKey,
  buildLabelerAssignmentPath,
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

function getQualitySignal(task: MarketplaceTaskVO): { label: string; color: string; desc: string } {
  if (task.submittedCount <= 0) {
    return { label: "等待首批提交", color: "default", desc: "可先小批量领取验证难度" };
  }
  const approvalRate = Math.round((task.approvedCount / task.submittedCount) * 100);
  if (approvalRate >= 85) {
    return { label: `通过率 ${approvalRate}%`, color: "success", desc: "适合连续领取" };
  }
  if (approvalRate >= 60) {
    return { label: `通过率 ${approvalRate}%`, color: "warning", desc: "提交前需仔细自检" };
  }
  return { label: `通过率 ${approvalRate}%`, color: "error", desc: "建议先阅读任务说明" };
}

function getMarketplaceStatus(task: MarketplaceTaskVO): { label: string; color: string } {
  if (task.activeAssignmentId) {
    return { label: "进行中", color: "processing" };
  }
  if (task.availableItemCount <= 0) {
    return { label: "已领完", color: "default" };
  }
  return { label: "可领取", color: "success" };
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
  const activeTasks = useMemo(() => tasks.filter((task) => task.activeAssignmentId), [tasks]);

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
      navigate(buildLabelerAssignmentPath(assignment.id));
    } catch (requestError) {
      message.error(getErrorMessage(requestError));
    } finally {
      setClaimingTaskId(null);
    }
  }

  function renderPrimaryAction(task: MarketplaceTaskVO) {
    return (
      <Button
        type={task.activeAssignmentId ? "default" : "primary"}
        icon={<ThunderboltOutlined />}
        loading={claimingTaskId === task.id}
        disabled={!task.activeAssignmentId && task.availableItemCount <= 0}
        onClick={() =>
          task.activeAssignmentId
            ? navigate(buildLabelerAssignmentPath(task.activeAssignmentId))
            : void handleClaim(task)
        }
      >
        {getClaimButtonText(task)}
      </Button>
    );
  }

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 8 }}>
            任务广场
          </Typography.Title>
          <Typography.Text type="secondary">
            只展示可领取任务。领取会锁定题目，并固定当前模板版本与审核配置。
          </Typography.Text>
        </div>
        <Space wrap>
          <Tag color="blue">阶段 3 · 领取与作答入口</Tag>
          <Button icon={<ReloadOutlined />} onClick={reloadCurrentPage}>
            刷新
          </Button>
        </Space>
      </Flex>

      <div className="labelhub-market-summary-grid" aria-busy={loading}>
        <Card className="labelhub-stat-card">
          <Statistic title="可领取任务" value={pagination.totalItems || summary.taskCount} />
          <Typography.Text type="secondary">后端已过滤不可领取任务</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="可领取题目" value={summary.availableItemCount} valueStyle={{ color: "#245bdb" }} />
          <Typography.Text type="secondary">按配额和未领取题目共同计算</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="我的进行中" value={summary.claimedByMeCount} />
          <Typography.Text type="secondary">含待作答、返修和待提交题目</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="我的提交" value={summary.submittedByMeCount} />
          <Typography.Text type="secondary">正式提交后自动累计</Typography.Text>
        </Card>
      </div>

      <div className="labelhub-market-workbench">
        <section className="labelhub-market-main">
          <Card className="labelhub-market-filter-card">
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
                <Button type="primary" onClick={submitQuery}>
                  查询
                </Button>
              </Space>
              <Typography.Text type="secondary">按更新时间排序</Typography.Text>
            </Flex>
          </Card>

          {error && (
            <Card className="labelhub-error-card">
              <Typography.Text type="danger">{error}</Typography.Text>
            </Card>
          )}

          <Card className="labelhub-market-table-card" loading={loading}>
            <div className="labelhub-market-table-head">
              <span>任务</span>
              <span>状态</span>
              <span>数据摘要</span>
              <span>截止时间</span>
              <span>质量信号</span>
              <span>操作</span>
            </div>

            {tasks.map((task) => {
              const status = getMarketplaceStatus(task);
              const quality = getQualitySignal(task);
              return (
                <article key={task.id} className="labelhub-market-row">
                  <div className="labelhub-market-row-main">
                    <Typography.Title level={5} className="labelhub-market-title">
                      {task.title}
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" className="labelhub-market-description">
                      {task.description || "暂无任务描述"}
                    </Typography.Paragraph>
                    <Space size={6} wrap className="labelhub-market-tags">
                      {task.tags.length > 0 ? task.tags.map((item) => <Tag key={item}>{item}</Tag>) : <Tag>未设置标签</Tag>}
                    </Space>
                  </div>
                  <Tag color={status.color}>{status.label}</Tag>
                  <div className="labelhub-market-metric">
                    <Typography.Text strong>可领 {formatMetric(task.availableItemCount)}</Typography.Text>
                    <Typography.Text type="secondary">
                      我已领 {formatMetric(task.claimedByMeCount)} / 提交 {formatMetric(task.submittedByMeCount)}
                    </Typography.Text>
                    <Progress percent={getClaimProgress(task)} size="small" showInfo={false} />
                  </div>
                  <Typography.Text strong>{formatTaskTime(task.deadlineAt)}</Typography.Text>
                  <div className="labelhub-market-quality">
                    <Tag color={quality.color}>{quality.label}</Tag>
                    <Typography.Text type="secondary">{quality.desc}</Typography.Text>
                  </div>
                  <Space size={8} wrap className="labelhub-market-row-actions">
                    {renderPrimaryAction(task)}
                    {task.activeAssignmentId && task.availableItemCount > 0 && (
                      <Button loading={claimingTaskId === task.id} onClick={() => void handleClaim(task)}>
                        领取下一题
                      </Button>
                    )}
                  </Space>
                </article>
              );
            })}

            {!loading && tasks.length === 0 && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无可领取任务，稍后刷新或调整筛选条件。"
                style={{ padding: "48px 0" }}
              />
            )}
          </Card>

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
        </section>

        <aside className="labelhub-market-side">
          <Card title="当前工作队列">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {activeTasks.length > 0 ? (
                activeTasks.slice(0, 3).map((task) => {
                  const activeAssignmentId = task.activeAssignmentId;
                  return (
                    <div key={task.id} className="labelhub-market-queue-item">
                      <div>
                        <Typography.Text strong>{task.title}</Typography.Text>
                        <br />
                        <Typography.Text type="secondary">
                          已领 {formatMetric(task.claimedByMeCount)} · 待继续作答
                        </Typography.Text>
                      </div>
                      {activeAssignmentId && (
                        <Button size="small" type="link" onClick={() => navigate(buildLabelerAssignmentPath(activeAssignmentId))}>
                          继续
                        </Button>
                      )}
                    </div>
                  );
                })
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有进行中的题目" />
              )}
            </Space>
          </Card>

          <Card title="本页概览">
            <div className="labelhub-market-mini-stats">
              <div>
                <FileDoneOutlined />
                <strong>{formatMetric(summary.submittedByMeCount)}</strong>
                <span>我的提交</span>
              </div>
              <div>
                <CheckCircleOutlined />
                <strong>{formatMetric(tasks.reduce((sum, task) => sum + task.approvedCount, 0))}</strong>
                <span>累计通过</span>
              </div>
              <div>
                <GiftOutlined />
                <strong>{formatMetric(summary.availableItemCount)}</strong>
                <span>可领题目</span>
              </div>
            </div>
          </Card>

          <Card title="任务选择建议">
            <Space direction="vertical" size={10}>
              <Typography.Text>
                优先继续已有进行中的题目，避免同一任务上下文在多次切换后丢失判断标准。
              </Typography.Text>
              <Typography.Text type="secondary">
                首次领取建议先选择可领题量充足、通过率较高且截止时间更近的任务。
              </Typography.Text>
              <Space size={8}>
                <ClockCircleOutlined />
                <Typography.Text type="secondary">截止时间以北京时间展示</Typography.Text>
              </Space>
            </Space>
          </Card>
        </aside>
      </div>
    </Space>
  );
}
