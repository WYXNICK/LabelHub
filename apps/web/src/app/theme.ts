import type { ThemeConfig } from "antd";

export const theme: ThemeConfig = {
  token: {
    colorPrimary: "#3370ff",
    colorSuccess: "#00b634",
    colorWarning: "#ff8800",
    colorError: "#f54a45",
    colorInfo: "#3370ff",
    colorText: "#1f2329",
    colorTextSecondary: "#646a73",
    colorBgLayout: "#f5f6f7",
    colorBorder: "#dee0e3",
    borderRadius: 6,
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Card: {
      borderRadiusLG: 8,
    },
    Layout: {
      siderBg: "#ffffff",
      headerBg: "#ffffff",
      bodyBg: "#f5f6f7",
    },
    Menu: {
      itemBorderRadius: 6,
      itemSelectedBg: "#e8f0fe",
      itemSelectedColor: "#3370ff",
    },
  },
};
