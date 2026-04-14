const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { auth, optionalAuth } = require('../middleware/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 20个无厘头标签
const DEFAULT_TAGS = [
  '穿越成猫', '时间循环', '全员失忆', '反向预言', '食物成精',
  '物品说话', '身体互换', '突然唱歌', '只有一天', '梦境入侵',
  '文字成真', '情绪天气', '影子叛逃', '记忆买卖', '味道颜色',
  '重力消失', '镜子世界', '年龄乱跳', '谎言实体', '遗忘即死'
];

// 获取故事列表
router.get('/', async (req, res, next) => {
  try {
    const { status, tag, sort = 'newest', page = 1, limit = 10 } = req.query;
    
    let query = supabase
      .from('stories')
      .select('*, users!inner(username)', { count: 'exact' })
      .eq('is_deleted', false);

    if (status) query = query.eq('status', status);
    if (tag) query = query.contains('tags', [tag]);

    // 排序
    if (sort === 'newest') query = query.order('created_at', { ascending: false });
    else if (sort === 'popular') query = query.order('view_count', { ascending: false });
    else if (sort === 'active') query = query.order('updated_at', { ascending: false });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    const { data: stories, error, count } = await query.range(from, to);
    
    if (error) throw error;

    res.json({
      stories: stories.map(s => ({
        id: s.id,
        title: s.title,
        tags: s.tags,
        status: s.status,
        authorName: s.users.username,
        viewCount: s.view_count,
        participantCount: s.participant_count,
        maxParagraphs: s.max_paragraphs,
        createdAt: s.created_at,
        updatedAt: s.updated_at
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

// 获取单个故事
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 获取故事
    const { data: story, error } = await supabase
      .from('stories')
      .select('*, users!inner(username)')
      .eq('id', id)
      .single();
    
    if (error || !story) {
      return res.status(404).json({ message: '故事不存在' });
    }

    // 增加浏览量
    await supabase
      .from('stories')
      .update({ view_count: story.view_count + 1 })
      .eq('id', id);

    // 获取段落
    const { data: paragraphs } = await supabase
      .from('paragraphs')
      .select('*, users!inner(username)')
      .eq('story_id', id)
      .eq('is_deleted', false)
      .order('order_index', { ascending: true });

    // 获取每个段落的续写版本
    const paragraphsWithVersions = await Promise.all(
      (paragraphs || []).map(async (p) => {
        const { data: versions } = await supabase
          .from('paragraph_versions')
          .select('*, users!inner(username)')
          .eq('paragraph_id', p.id)
          .eq('is_deleted', false)
          .order('vote_count', { ascending: false });

        return {
          id: p.id,
          content: p.content,
          authorName: p.users.username,
          status: p.status,
          order: p.order_index,
          likeCount: p.like_count,
          commentCount: p.comment_count,
          createdAt: p.created_at,
          versions: (versions || []).map(v => ({
            id: v.id,
            content: v.content,
            authorName: v.users.username,
            voteCount: v.vote_count,
            isWinner: v.is_winner,
            createdAt: v.created_at
          }))
        };
      })
    );

    res.json({
      story: {
        id: story.id,
        title: story.title,
        tags: story.tags,
        status: story.status,
        authorName: story.users.username,
        viewCount: story.view_count + 1,
        participantCount: story.participant_count,
        maxParagraphs: story.max_paragraphs,
        paragraphs: paragraphsWithVersions,
        createdAt: story.created_at,
        updatedAt: story.updated_at
      }
    });
  } catch (err) {
    next(err);
  }
});

// 创建故事
router.post('/', auth, async (req, res, next) => {
  try {
    const { title, tags, content } = req.body;
    
    if (!title || title.trim().length < 2) {
      return res.status(400).json({ message: '标题至少需要2个字符' });
    }
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ message: '内容至少需要10个字符' });
    }
    if (!tags || tags.length === 0) {
      return res.status(400).json({ message: '请至少选择一个标签' });
    }

    const storyId = uuidv4();
    const now = new Date().toISOString();

    // 创建故事
    const { data: story, error } = await supabase
      .from('stories')
      .insert({
        id: storyId,
        title: title.trim(),
        tags: tags.slice(0, 3),
        author_id: req.user.id,
        status: 'writing',
        max_paragraphs: 50,
        view_count: 0,
        participant_count: 1,
        is_deleted: false,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();
    
    if (error) throw error;

    // 创建第一个段落
    const { error: paraError } = await supabase
      .from('paragraphs')
      .insert({
        id: uuidv4(),
        story_id: storyId,
        author_id: req.user.id,
        content: content.trim(),
        order_index: 0,
        status: 'confirmed',
        like_count: 0,
        comment_count: 0,
        is_deleted: false,
        created_at: now
      });
    
    if (paraError) throw paraError;

    // 增加用户贡献分
    await supabase
      .from('users')
      .update({ contribution_score: req.user.contribution_score + 10 })
      .eq('id', req.user.id);

    res.json({ story: { id: storyId, ...story } });
  } catch (err) {
    next(err);
  }
});

// 提交续写
router.post('/:storyId/paragraphs/:paragraphId/continue', auth, async (req, res, next) => {
  try {
    const { storyId, paragraphId } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ message: '内容至少需要10个字符' });
    }
    if (content.length > 1000) {
      return res.status(400).json({ message: '内容不能超过1000字' });
    }

    // 检查故事状态
    const { data: story } = await supabase
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .single();
    
    if (!story) return res.status(404).json({ message: '故事不存在' });
    if (story.status !== 'writing') return res.status(400).json({ message: '故事当前不可续写' });

    // 检查段落是否存在
    const { data: paragraph } = await supabase
      .from('paragraphs')
      .select('*')
      .eq('id', paragraphId)
      .single();
    
    if (!paragraph) return res.status(404).json({ message: '段落不存在' });

    // 检查是否已有5个版本
    const { data: versions, count } = await supabase
      .from('paragraph_versions')
      .select('*', { count: 'exact' })
      .eq('paragraph_id', paragraphId)
      .eq('is_deleted', false);

    if (count >= 5) {
      return res.status(400).json({ message: '该段落续写版本已达上限' });
    }

    // 创建续写版本
    const { data: version, error } = await supabase
      .from('paragraph_versions')
      .insert({
        id: uuidv4(),
        paragraph_id: paragraphId,
        story_id: storyId,
        author_id: req.user.id,
        content: content.trim(),
        vote_count: 0,
        is_winner: false,
        is_deleted: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;

    // 增加用户贡献分
    await supabase
      .from('users')
      .update({ contribution_score: req.user.contribution_score + 5 })
      .eq('id', req.user.id);

    res.json({ version });
  } catch (err) {
    next(err);
  }
});

// 投票
router.post('/:storyId/paragraphs/:paragraphId/vote', auth, async (req, res, next) => {
  try {
    const { storyId, paragraphId } = req.params;
    const { versionId } = req.body;

    // 检查是否已经投票
    const { data: existingVote } = await supabase
      .from('votes')
      .select('*')
      .eq('paragraph_id', paragraphId)
      .eq('user_id', req.user.id)
      .single();

    if (existingVote) {
      return res.status(400).json({ message: '您已经投过票了' });
    }

    // 记录投票
    await supabase
      .from('votes')
      .insert({
        id: uuidv4(),
        paragraph_id: paragraphId,
        version_id: versionId,
        user_id: req.user.id,
        created_at: new Date().toISOString()
      });

    // 增加版本票数
    const { data: version } = await supabase
      .from('paragraph_versions')
      .select('vote_count')
      .eq('id', versionId)
      .single();
    
    await supabase
      .from('paragraph_versions')
      .update({ vote_count: version.vote_count + 1 })
      .eq('id', versionId);

    // 增加用户贡献分
    await supabase
      .from('users')
      .update({ contribution_score: req.user.contribution_score + 2 })
      .eq('id', req.user.id);

    res.json({ message: '投票成功' });
  } catch (err) {
    next(err);
  }
});

// 评论
router.post('/:storyId/paragraphs/:paragraphId/comments', auth, async (req, res, next) => {
  try {
    const { paragraphId } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim().length < 2) {
      return res.status(400).json({ message: '评论内容太短' });
    }

    const { error } = await supabase
      .from('comments')
      .insert({
        id: uuidv4(),
        paragraph_id: paragraphId,
        author_id: req.user.id,
        content: content.trim(),
        is_deleted: false,
        created_at: new Date().toISOString()
      });
    
    if (error) throw error;

    // 增加段落评论数
    const { data: paragraph } = await supabase
      .from('paragraphs')
      .select('comment_count')
      .eq('id', paragraphId)
      .single();
    
    await supabase
      .from('paragraphs')
      .update({ comment_count: paragraph.comment_count + 1 })
      .eq('id', paragraphId);

    res.json({ message: '评论成功' });
  } catch (err) {
    next(err);
  }
});

// 点赞段落
router.post('/:storyId/paragraphs/:paragraphId/like', auth, async (req, res, next) => {
  try {
    const { paragraphId } = req.params;

    // 检查是否已经点赞
    const { data: existingLike } = await supabase
      .from('likes')
      .select('*')
      .eq('paragraph_id', paragraphId)
      .eq('user_id', req.user.id)
      .single();

    if (existingLike) {
      return res.status(400).json({ message: '您已经点赞过了' });
    }

    // 记录点赞
    await supabase
      .from('likes')
      .insert({
        id: uuidv4(),
        paragraph_id: paragraphId,
        user_id: req.user.id,
        created_at: new Date().toISOString()
      });

    // 增加点赞数
    const { data: paragraph } = await supabase
      .from('paragraphs')
      .select('like_count')
      .eq('id', paragraphId)
      .single();
    
    await supabase
      .from('paragraphs')
      .update({ like_count: paragraph.like_count + 1 })
      .eq('id', paragraphId);

    res.json({ message: '点赞成功' });
  } catch (err) {
    next(err);
  }
});

// 获取标签列表
router.get('/tags/list', async (req, res) => {
  res.json({
    tags: DEFAULT_TAGS.map((name, index) => ({
      id: index,
      name,
      count: Math.floor(Math.random() * 50) // 模拟使用次数
    }))
  });
});

module.exports = router;
