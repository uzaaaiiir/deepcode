import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Breach } from './breach.entity';
import { Repository } from 'typeorm';
import dns from 'dns';

import * as fs from 'fs';
import * as readline from 'readline';
import { Like } from 'typeorm';

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
        // process each line
        const { username, password, url } =
          this.getUsernamePasswordAndUrl(line);

        console.log(`Processing ${url}`);

        try {
          const urlObject = new URL(url);
          const domain = urlObject.hostname;
          const protocol = urlObject.protocol;
          const path = urlObject.pathname;
          const port = urlObject.port;
          const ipAddress = await new Promise<string[]>((resolve) => {
            dns.resolve4(domain, (err, addresses) => {
              if (err) resolve(['0.0.0.0']);
              else resolve(addresses);
            });
          });

          const breach = new Breach();
          breach.username = username;
          breach.password = password;
          breach.url = url;
          breach.domain = domain;
          breach.ipAddress = ipAddress[0];
          breach.port = +port;
          breach.urlPath = path;
          breach.protocol = protocol;
          console.log(breach);

          await this.breachRepository.save(breach);
          parsedData.push(line);
        } catch (error) {
          console.error(`Error processing ${url}`, error);
        }
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

  getUsernamePasswordAndUrl(data: string): {
    username: string;
    password: string;
    url: string;
  } {
    const lastColonIndex = data.lastIndexOf(':');
    const secondLastColonIndex = data.lastIndexOf(':', lastColonIndex - 1);

    const url = data.substring(0, secondLastColonIndex);
    const username = data.substring(secondLastColonIndex + 1, lastColonIndex);
    const password = data.substring(lastColonIndex + 1);

    return { username, password, url };
  }

  async seedDatabase(data: Breach[]): Promise<void> {
    for (const item of data) {
      await this.breachRepository.save(item);
    }
  }

  async filterBreaches(query: Record<string, string>): Promise<any> {
    const qb = this.breachRepository.createQueryBuilder('breach');
  
    // Apply filters dynamically
    for (const [key, value] of Object.entries(query)) {
      if (key === 'tags') {
        // Handle multiple tags
        const tags = value.split(','); // Split tags by comma
        tags.forEach((tag, index) => {
          qb.andWhere(`FIND_IN_SET(:tag${index}, breach.tags) > 0`, {
            [`tag${index}`]: tag.trim(),
          });
        });
      } else {
        qb.andWhere(`breach.${key} = :${key}`, { [key]: value });
      }
    }
  
    return qb.getMany();
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
