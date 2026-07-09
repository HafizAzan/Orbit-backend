import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.string().valid('true', 'false').default('true'),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('30m'),
  JWT_SESSION_EXPIRES_IN: Joi.string().default('30m'),
  JWT_REMEMBER_EXPIRES_IN: Joi.string().default('30d'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SESSION_EXPIRES_IN: Joi.string().default('30m'),
  JWT_REFRESH_REMEMBER_EXPIRES_IN: Joi.string().default('30d'),
  SMTP_HOST: Joi.string().hostname().required(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().email().required(),
  SMTP_PASSWORD: Joi.string().required(),
  EMAIL_FROM: Joi.string().required(),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  STRIPE_REFUND_WINDOW_DAYS: Joi.number().integer().min(1).max(90).default(7),
  CORS_ORIGIN: Joi.string()
    .required()
    .custom((value, helpers) => {
      const origins = value
        .split(',')
        .map((origin: string) => origin.trim())
        .filter(Boolean);

      if (origins.length === 0) {
        return helpers.error('any.invalid');
      }

      for (const origin of origins) {
        const { error } = Joi.string().uri().validate(origin);
        if (error) {
          return helpers.error('any.invalid');
        }
      }

      return value;
    }),
});
