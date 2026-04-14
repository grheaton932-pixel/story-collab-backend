const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { auth, JWT_SECRET } = require('../middleware/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 用户注册/登录
router.post('/register', async (req, res, next) => {
  try {
    const { username } = req.body;
    
    if (!username || username.trim().length < 2) {
      return res.status(400).json({ message: '用户名至少需要2个字符' });
    }

    // 检查用户是否已存在
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim())
      .single();

    let user;
    
    if (existingUser) {
      user = existingUser;
    } else {
      // 创建新用户
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          id: uuidv4(),
          username: username.trim(),
          contribution_score: 0,
          is_admin: username.trim() === 'admin',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      user = newUser;
    }

    // 生成JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user.id,
        username: user.username,
        contributionScore: user.contribution_score,
        isAdmin: user.is_admin
      },
      token
    });
  } catch (err) {
    next(err);
  }
});

// 获取当前用户信息
router.get('/me', auth, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      contributionScore: req.user.contribution_score,
      isAdmin: req.user.is_admin
    }
  });
});

// 获取排行榜
router.get('/leaderboard', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, contribution_score')
      .order('contribution_score', { ascending: false })
      .limit(limit);
    
    if (error) throw error;

    res.json({
      users: users.map((u, index) => ({
        id: u.id,
        username: u.username,
        contributionScore: u.contribution_score,
        rank: index + 1
      }))
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
