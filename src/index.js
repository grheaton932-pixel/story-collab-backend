const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 检查 Supabase 配置
let supabase, supabaseAdmin;

try {
  const { createClient } = require('@supabase/supabase-js');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ 错误: 未设置 Supabase 环境变量');
    console.error('请设置以下环境变量:');
    console.error('  - SUPABASE_URL');
    console.error('  - SUPABASE_ANON_KEY');
    console.error('  - SUPABASE_SERVICE_KEY\n');
  } else {
    // 普通客户端
    supabase = createClient(supabaseUrl, supabaseKey);
    
    // 服务角色客户端
    supabaseAdmin = supabaseServiceKey 
      ? createClient(supabaseUrl, supabaseServiceKey)
      : supabase;
    
    console.log('✅ Supabase 客户端已初始化');
  }
} catch (err) {
  console.error('❌ Supabase 初始化失败:', err.message);
}

// 路由
app.use('/api/users', require('./routes/users'));
app.use('/api/stories', require('./routes/stories'));
app.use('/api/revival', require('./routes/revival'));
app.use('/api/admin', require('./routes/admin'));

// 健康检查
app.get('/health', async (req, res) => {
  try {
    let supabaseStatus = 'disconnected';
    
    if (supabase) {
      const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
      supabaseStatus = error ? 'error' : 'connected';
    }
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      supabase: supabaseStatus
    });
  } catch (err) {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      supabase: 'error',
      error: err.message
    });
  }
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

// 错误处理
app.use(require('./middleware/errorHandler'));

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║     🎉 共创故事工坊后端服务已启动              ║
║              (Supabase 版本)                   ║
║                                                ║
║     📡 地址: http://localhost:${PORT}              ║
║                                                ║
║     📚 API 文档:                               ║
║     - 用户: /api/users                         ║
║     - 故事: /api/stories                       ║
║     - 复活: /api/revival                       ║
║     - 管理: /api/admin                         ║
║                                                ║
║     💚 健康检查: /health                       ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});

module.exports = app;
