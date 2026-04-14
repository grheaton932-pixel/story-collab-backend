// 错误处理中间件
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    message: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
