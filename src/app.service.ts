import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Breach } from './breach.entity';
import { Repository } from 'typeorm';

import * as fs from 'fs';
import * as readline from 'readline';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(Breach)
    private breachRepository: Repository<Breach>,
  ) {}

  async parseFile(filePath: string): Promise<any> {
    // parse the file by lne and store in a list
    const parsedData = [];
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      rl.on('line', async (line) => {
        parsedData.push(line);
      });

      rl.on('close', () => {
        console.log(`Processing completed in ${Date.now() - start}ms`);
        resolve(parsedData);
      });

      rl.on('error', (err) => {
        reject(err);
      });
    });
  }

  findAll(): Promise<Breach[]> {
    return this.breachRepository.find();
  }

  findOne(id: number): Promise<Breach | null> {
    return this.breachRepository.findOne({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    await this.breachRepository.delete(id);
  }
}
