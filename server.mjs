import express from "express";
import { getCookie } from "./browser.mjs";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Lưu kết quả jobs trong memory
const jobs = new Map();

// Dọn jobs cũ hơn 10 phút
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > 10 * 60 * 1000) jobs.delete(id);
  }
}, 60000);

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "fxflow-cookie-service" });
});

// Tạo job lấy cookie (trả về ngay jobId)
app.post("/get-cookie", (req, res) => {
  const { email, password, proxy } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Thiếu email hoặc password",
    });
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  jobs.set(jobId, {
    status: "processing",
    email,
    createdAt: Date.now(),
    result: null,
  });

  console.log(`[${new Date().toISOString()}] Job ${jobId}: ${email}`);

  // Chạy ngầm, không block response
  getCookie({ email, password, proxy })
    .then((result) => {
      jobs.set(jobId, {
        ...jobs.get(jobId),
        status: "done",
        result,
      });
      console.log(`[${new Date().toISOString()}] Job ${jobId}: done - success: ${result.success}`);
    })
    .catch((err) => {
      jobs.set(jobId, {
        ...jobs.get(jobId),
        status: "error",
        result: { success: false, error: err.message },
      });
      console.error(`[${new Date().toISOString()}] Job ${jobId}: error - ${err.message}`);
    });

  // Trả về ngay jobId (trong vài ms)
  res.json({ jobId, status: "processing", message: "Đang xử lý. Poll GET /job/:jobId để lấy kết quả." });
});

// Lấy kết quả job
app.get("/job/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: "Job không tồn tại hoặc đã hết hạn" });
  }

  if (job.status === "processing") {
    return res.json({ jobId: req.params.jobId, status: "processing", elapsed: Date.now() - job.createdAt });
  }

  res.json({ jobId: req.params.jobId, status: job.status, ...job.result });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
