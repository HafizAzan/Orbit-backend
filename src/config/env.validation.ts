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
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  RESEND_API_KEY: Joi.string().required(),
  EMAIL_FROM: Joi.string().default('FlowSync <onboarding@resend.dev>'),
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
