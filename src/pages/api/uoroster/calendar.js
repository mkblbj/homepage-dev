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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const department = normalizeDepartment(req.query?.department);
  if (!department) {
    return sendHtml(res, 400, errorPage("部门参数无效", "department 仅接受 Production 或 Office。"));
  }

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

  const [status, , data] = await httpProxy(buildCalendarUrl(config.baseUrl, department), {
    headers: {
      Authorization: `token ${config.token}`,
      Accept: "application/json",
    },
  });

  if (status !== 200) {
    logger.error("HR roster calendar returned %d for department %s", status, department);
    return sendHtml(
      res,
      502,
      errorPage("无法获取排班月历", `HR 接口返回 ${status}。请确认 HR 服务状态与 API 凭据是否有效。`),
    );
  }

  let html = null;
  try {
    html = JSON.parse(data.toString()).message;
  } catch (e) {
    html = null;
  }

  if (typeof html !== "string" || html.length === 0) {
    logger.error("HR roster calendar response carried no message field for department %s", department);
    return sendHtml(res, 502, errorPage("排班月历内容异常", "HR 接口未返回月历内容。"));
  }

  // 月历一个月才换一次，但排班改动后要看得见 —— 5 分钟是两者的折中。
  res.setHeader("Cache-Control", "private, max-age=300");
  return sendHtml(res, 200, html);
}
