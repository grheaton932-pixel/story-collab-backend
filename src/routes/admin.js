const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { adminAuth } = require('../middleware/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 获取统计数据
router.get('/stats', adminAuth, async (req, res, next) => {
  try {
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact' });

    const { count: totalStories } = await supabase
      .from('stories')
      .select('*', { count: 'exact' })
      .eq('is_deleted', false);

    const { count: activeStories } = await supabase
      .from('stories')
      .select('*', { count: 'exact' })
      .eq('status', 'writing')
      .eq('is_deleted', false);

    const { count: completedStories } = await supabase
      .from('stories')
      .select('*', { count: 'exact' })
      .eq('status', 'completed')
      .eq('is_deleted', false);

    res.json({
      stats: {
        totalUsers: totalUsers || 0,
        totalStories: totalStories || 0,
        activeStories: activeStories || 0,
        completedStories: completedStories || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

// 获取故事列表（管理）
router.get('/stories', adminAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: stories, error, count } = await supabase
      .from('stories')
      .select('*, users!inner(username)', { count: 'exact' })
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    res.json({
      stories: stories.map(s => ({
        id: s.id,
        title: s.title,
        authorName: s.users.username,
        status: s.status,
        maxParagraphs: s.max_paragraphs,
        participantCount: s.participant_count,
        viewCount: s.view_count,
        createdAt: s.created_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    next(err);
  }
});

// 更新故事（软删除）
router.patch('/stories/:id', adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isDeleted } = req.body;

    const { error } = await supabase
      .from('stories')
      .update({ is_deleted: isDeleted })
      .eq('id', id);

    if (error) throw error;

    res.json({ message: '操作成功' });
  } catch (err) {
    next(err);
  }
});

// 获取用户列表
router.get('/users', adminAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: users, error, count } = await supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    res.json({
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        isAdmin: u.is_admin,
        isBanned: u.is_banned,
        contributionScore: u.contribution_score,
        createdAt: u.created_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    next(err);
  }
});

// 封禁/解封用户
router.patch('/users/:id/ban', adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isBanned } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ is_banned: isBanned })
      .eq('id', id);

    if (error) throw error;

    res.json({ message: '操作成功' });
  } catch (err) {
    next(err);
  }
});

// 执行复活投票
router.post('/revival/execute', adminAuth, async (req, res, next) => {
  try {
    // 获取待复活故事及其票数
    const { data: stories } = await supabase
      .from('stories')
      .select('id')
      .eq('status', 'pending_revival')
      .eq('is_deleted', false);

    // 获取每个故事的投票数
    const storiesWithVotes = await Promise.all(
      (stories || []).map(async (s) => {
        const { count } = await supabase
          .from('revival_votes')
          .select('*', { count: 'exact' })
          .eq('story_id', s.id);

        return { id: s.id, voteCount: count || 0 };
      })
    );

    // 按票数排序，取前10
    storiesWithVotes.sort((a, b) => b.voteCount - a.voteCount);
    const topStories = storiesWithVotes.slice(0, 10);

    // 复活这些故事
    for (const story of topStories) {
      await supabase
        .from('stories')
        .update({ 
          status: 'writing',
          max_paragraphs: 50,
          updated_at: new Date().toISOString()
        })
        .eq('id', story.id);
    }

    // 清空复活投票
    await supabase
      .from('revival_votes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    res.json({
      message: '复活投票执行成功',
      revivedCount: topStories.length,
      revivedStories: topStories
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
