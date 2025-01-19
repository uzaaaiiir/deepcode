import { Controller } from '@nestjs/common';
import { AppService } from './app.service';
import { extname } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import {
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  Query,
} from '@nestjs/common';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './files',
        filename: (req, file, callback) => {
          // avoids saving duplicate file with same name
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);

          const ext = extname(file.originalname);
          const fileName = `${uniqueSuffix}${ext}`;
          callback(null, fileName);
        },
      }),
    }),
  )
  async handleUpload(@UploadedFile() file: Express.Multer.File): Promise<any> {
    try {
      // parse the uploaded file
      const data = await this.appService.parseAndEnrichFile(file.path);

      // enrich the data
      // const enrichedData = await Promise.all(
      //   parsedData.map(async (data) => {
      //     return await this.appService.enrichData(data.url);
      //   }),
      // );

      // // save the database with the enriched data
      // await this.appService.seedDatabase(parsedData);

      return {
        message: 'file processed successfully',
        data,
        // enrichedData,
      };
    } catch (error) {
      console.error('error processing file', error);
      throw new Error('failed to process file try again');
    }
  }

  @Get('/breaches')
  async getAllBreaches(@Query() query: Record<string, string>): Promise<any> {
    // Pass the filters to the service
    return this.appService.filterBreaches(query);
  }
}
