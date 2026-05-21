import { Flex, Spin, Typography } from "antd";

export function LoadingPage() {
  return (
    <Flex align="center" justify="center" vertical gap={16} style={{ minHeight: "100vh" }}>
      <Spin size="large" />
      <Typography.Text type="secondary">正在校验登录状态...</Typography.Text>
    </Flex>
  );
}
