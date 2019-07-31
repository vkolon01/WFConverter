import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RouterMiddleware } from './middleware/router.middleware';
import { PagesModule } from './controllers/pages/pages.module';

@Module({
  imports: [PagesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RouterMiddleware)
      .forRoutes({path: '*', method: RequestMethod.ALL});
  }
}
