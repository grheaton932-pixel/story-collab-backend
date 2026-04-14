const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { auth } = require('../middleware/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 获取复活投票排行榜
router.get('/leaderboard', async (req, res, next) => {
  try {
    const { data: stories, error } = await supabase
      .from('stories')
      .select('*, users!inner(username), revival_votes(count)')
      .eq('status', 'pending_revival')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    
    if (error) throw error;

    // 获取每个故事的投票数
    const storiesWithVotes = await Promise.all(
      (stories || []).map(async (s) => {
        const { count } = await supabase
          .from('revival_votes')
          .select('*', { count: 'exact' })
          .eq('story_id', s.id);

        return {
          id: s.id,
          title: s.title,
          authorName: s.users.username,
          voteCount: count || 0,
          participantCount: s.participant_count,
          endedAt: s.updated_at
        };
      })
    );

    // 按投票数排序
    storiesWithVotes.sort((a, b) => b.voteCount - a.voteCount);

    res.json({
      cycle: 1,
      stories: storiesWithVotes
    });
  } catch (err) {
    next(err);
  }
});

// 投票复活
router.post('/vote/:storyId', auth, async (req, res, next) => {
  try {
    const { storyId } = req.params;

    // 检查故事是否存在且处于待复活状态
    const { data: story } = await supabase
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .eq('status', 'pending_revival')
      .single();

    if (!story) {
      return res.status(404).json({ message: '故事不存在或不可复活' });
    }

    // 检查是否已经投票
    const { data: existingVote } = await supabase
      .from('revival_votes')
      .select('*')
      .eq('story_id', storyId)
      .eq('user_id', req.user.id)
      .single();

    if (existingVote) {
      return res.status(400).json({ message: '您已经为这个故事投过票了' });
    }

    // 记录投票
    await supabase
      .from('revival_votes')
      .insert({
        id: uuidv4(),
        story_id: storyId,
        user_id: req.user.id,
        created_at: new Date().toISOString()
      });

    res.json({ message: '投票成功' });
  } catch (err) {
    next(err);
  }
});

// 获取我的复活投票
router.get('/my-votes', auth, async (req, res, next) => {
  try {
    const { data: votes } = await supabase
      .from('revival_votes')
      .select('story_id')
      .eq('user_id', req.user.id);

    res.json({
      votedStoryIds: (votes || []).map(v => v.story_id),
      remainingVotes: 10 - (votes?.length || 0)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
