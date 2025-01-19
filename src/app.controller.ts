import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { extname } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Post, UploadedFile, UseInterceptors } from '@nestjs/common';


@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return 'Hello World!';
  }

  @Post('/upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './files',
      filename: (req, file, callback) => {

        // avoids saving duplicate file with same name
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        
        const ext = extname(file.originalname);
        const fileName = `${uniqueSuffix}${ext}`;
        callback(null, fileName);
      },
    }),
  }))
  handleUpload(@UploadedFile() file: Express.Multer.File) {

    // logic goes here (needs update)
    console.log('file', file);
    return 'file uploaded api'; 
  } 
}
