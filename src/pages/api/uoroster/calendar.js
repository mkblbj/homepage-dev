import { servicesFromConfig } from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";
import {
  buildCalendarUrl,
  findRosterCalendarConfig,
  normalizeDepartment,
} from "widgets/uoattendance/roster-calendar.mjs";

const logger = createLogger("uorosterCalendar");

// 入口是新标签页，所以出错时也回 HTML —— 用户看到的应是可读提示，而不是裸 JSON。
function errorPage(title, detail) {
  return [
    "<!DOCTYPE html>",
    '<html lang="zh"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${title}</title></head>`,
    '<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.5rem;line-height:1.7">',
    `<h1 style="font-size:1.25rem;margin:0 0 .75rem">${title}</h1>`,
    `<p style="color:#555;margin:0">${detail}</p>`,
    "</body></html>",
  ].join("");
}

function sendHtml(res, status, html) {
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(html);
}

// httpProxy 在连接失败时（DNS 解析失败 / ECONNREFUSED / TLS 错误等）不会 reject，
// 而是把失败伪装成一次「响应」：status 500、contentType 固定是 application/json，
// data 则是它自己拼出的 { error } 对象。这个 data 不是 Buffer——而 HR 真的回 500
// 时 data 一定是 Buffer（原始响应体）。这是结构上可靠、而不是猜的区分点。
function isConnectionFailure(status, contentType, data) {
  return (
    status === 500 &&
    contentType === "application/json" &&
    Boolean(data) &&
    typeof data === "object" &&
    !Buffer.isBuffer(data) &&
    Boolean(data.error)
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendHtml(res, 405, errorPage("请求方法不支持", `该接口仅支持 GET 请求，收到的是 ${req.method}。`));
  }

  const department = normalizeDepartment(req.query?.department);
  if (!department) {
    return sendHtml(res, 400, errorPage("部门参数无效", "department 仅接受 Production 或 Office。"));
  }

  // 前端按钮的显隐由 cleanServiceGroups 派生的 widget.rosterCalendar 决定，
  // 它会合并 services.yaml / Docker 标签 / Kubernetes 注解三个配置来源；
  // 但这里的 servicesFromConfig() 只读 services.yaml——如果改用 Docker 标签
  // 配置本 widget，会出现按钮渲染出来、这里却永远读不到 config，点击必 503
  // 的情况。当前部署用的是 yaml，暂不处理，仅记录此限制。
  const config = findRosterCalendarConfig(await servicesFromConfig());
  if (!config) {
    return sendHtml(
      res,
      503,
      errorPage(
        "排班月历未配置",
        "请在 config/services.yaml 的 uoattendance widget 下补充 rosterCalendarUrl 与 rosterCalendarToken。",
      ),
    );
  }

  // httpProxy 内部的 new URL(url) 不在它自己的 try/catch 保护范围内：上游网络失败会被它
  // 降级成 [500, ...] 返回值，但 rosterCalendarUrl 本身格式非法（例如漏写协议头）会同步抛出
  // TypeError，变成这里的 rejected promise。必须兜住，否则会绕过统一的中文错误页设计。
  let proxyResult;
  try {
    proxyResult = await httpProxy(buildCalendarUrl(config.baseUrl, department), {
      headers: {
        Authorization: `token ${config.token}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    logger.error("HR roster calendar request threw for department %s: %s", department, e?.message ?? e);
    return sendHtml(
      res,
      502,
      errorPage(
        "无法获取排班月历",
        "请求 HR 接口时发生异常，请确认 rosterCalendarUrl 是否为包含协议头（如 https://）的完整地址。",
      ),
    );
  }

  const [status, contentType, data] = proxyResult;

  if (status !== 200) {
    if (isConnectionFailure(status, contentType, data)) {
      // 连接从未建立，HR 根本没机会响应——不要写成「HR 返回 500」，否则运维会去
      // HR 侧翻一个不存在的 500。真正线索是 httpProxy 捕获到的底层网络异常。
      logger.error(
        "HR roster calendar request for department %s never reached HR — connection failed before any response (content-type %s): %s",
        department,
        contentType,
        data.error?.message ?? "unknown error",
      );
    } else {
      logger.error(
        "HR roster calendar returned %d (content-type %s) for department %s",
        status,
        contentType,
        department,
      );
    }
    return sendHtml(
      res,
      502,
      errorPage("无法获取排班月历", `HR 接口返回 ${status}。请确认 HR 服务状态与 API 凭据是否有效。`),
    );
  }

  let html = null;
  let parseError = null;
  try {
    html = JSON.parse(data.toString()).message;
  } catch (e) {
    html = null;
    parseError = e;
  }

  if (typeof html !== "string" || html.length === 0) {
    if (parseError) {
      // Frappe 会话/凭据异常时的典型表现：200 + HTML 登录页，不是 JSON。这条日志
      // 是唯一线索，必须说清「不是 JSON」，而不是笼统的「缺 message 字段」。
      logger.error(
        "HR roster calendar response for department %s was not valid JSON (expected application/json, got %s): %s",
        department,
        contentType,
        parseError?.message ?? "unknown parse error",
      );
    } else {
      logger.error(
        "HR roster calendar response carried no message field for department %s (content-type %s)",
        department,
        contentType,
      );
    }
    return sendHtml(res, 502, errorPage("排班月历内容异常", "HR 接口未返回月历内容。"));
  }

  // 月历一个月才换一次，但排班改动后要看得见 —— 5 分钟是两者的折中。
  res.setHeader("Cache-Control", "private, max-age=300");
  return sendHtml(res, 200, html);
}
