const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 验证token中间件
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: '未登录' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 从Supabase获取用户信息
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ message: '用户不存在' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: '登录已过期' });
  }
};

// 可选验证（不强制登录）
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', decoded.userId)
        .single();
      
      if (user) req.user = user;
    }
    
    next();
  } catch {
    next();
  }
};

// 管理员验证
const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: '需要管理员权限' });
      }
      next();
    });
  } catch (err) {
    res.status(401).json({ message: '未登录' });
  }
};

module.exports = { auth, optionalAuth, adminAuth, JWT_SECRET };
