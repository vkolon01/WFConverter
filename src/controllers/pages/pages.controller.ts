import { Controller, Get, Param } from '@nestjs/common';
import {PageElement} from "../../models/page-element.model";
import {Page} from "../../models/page.model";
import {ElementSettings} from '../../models/page-element.model';
import oracledb = require('oracledb');



@Controller('pages')
export class PagesController {

    // Used for settings with multiple type values
    settingsTranslation = {
        TFON: ['FONT', 'TFCS', 'TFSZ', 'TFST'],
        TFST: ['TFBD', 'TFTS', 'TFUL'],
    };

    valuesTranslation = {
        TFST: {
            B: 'TFBD',
            I: 'TFTS',
            U: 'TFUL',
            multiline: true,
        },
    };

    settingMapping = {
        fixed: ['TFBD', 'TFTS', 'TFUL'],
        mutable: ['PBRC', 'TFRC', 'TFON'],
    };

    @Get(':pageNumber')
    async getPage(@Param('pageNumber') pageNumber: string) {

        try {
            const pageAttr = await this.fetchPageByNumber(pageNumber);
            if (pageAttr) {
                const testPage = pageAttr as string;
                const testPageArray = testPage.split('\n');
                const pageResolution = testPageArray[0].split(',');
                const pageSettings = this.setSettings(testPageArray[1]);

                let multilineSettings;

                // find the multiline section
                let staticElementsStrArr = [];
                let multilineElementsStrArr = [];

                for (let i = 0; i < testPageArray.length; i++) {

                    // Find multiline element  ( TODO find end of header by missing semicolon )
                    if (testPageArray[i].charAt(0) === 'M') {
                        const splitElement = testPageArray[i].split(',');
                        const multilineSettingsArr = splitElement.slice(1, 3);
                        multilineSettings = {
                            numOfElements: multilineSettingsArr[0],
                            margin: multilineSettingsArr[1],
                        };

                        // Remove the multiline settings from the string
                        testPageArray[i] = splitElement.slice(3).join();

                        // Divide the static and multiline elements into two different arrays.
                        staticElementsStrArr = testPageArray.slice(0, i);
                        multilineElementsStrArr = testPageArray.slice(i);

                    }
                }

                const staticElements = [];
                const multilineElements = [];

                // refine static elements
                const staticPageElements = staticElementsStrArr.filter((element) => {
                    const splitElement = element.split(',');
                    return this.checkIfElement(splitElement.slice(0, 4));
                });
                staticPageElements.forEach(element => {

                    const elementObj = this.getElementSettings(element);
                    staticElements.push(elementObj);
                });

                // refine multiline elements
                const multilinePageElements = multilineElementsStrArr.filter((element) => {
                    const splitElement = element.split(',');
                    return this.checkIfElement(splitElement.slice(0, 4));
                });
                multilinePageElements.forEach(element => {

                    const elementObj = this.getElementSettings(element);
                    multilineElements.push(elementObj);
                });

                // Page Definition
                const resolution = {
                    x: parseInt(pageResolution[0], 10),
                    y: parseInt(pageResolution[1], 10),
                };
                const page: Page = {
                    resolution,
                    pageSettings,
                    staticElements,
                    multilineElements,
                    multilineSettings,
                };

                // Send the page response
                return page;
            } else {
                return 'no data';
            }
        } catch (e) {
            console.log(e);
            return 'no data';
        }
    }

    translateSettings(settings): ElementSettings {

        let fileChanged = false;
        let newArr: ElementSettings = {
            mutable: {},
            fixed: settings.fixed,
        };

        Object.keys(settings.mutable).forEach(item => {

            // get value array
            const itemValue = settings.mutable[item];
            const settingValueArray = itemValue.split(/[,"]/).filter(el => el.length > 0);

            if (this.settingsTranslation[item]) {

                fileChanged = true;

                // get setting names and apply the values in order
                this.settingsTranslation[item].forEach((subSettingName, i) => {
                    if (settingValueArray[i]) {
                        const translatedSetting = this.valuesTranslation[subSettingName];
                        if (translatedSetting) {
                            if (translatedSetting.multiline) {
                                const settingCharacters = settingValueArray[i].split('');
                                settingCharacters.forEach(character => {
                                    if (translatedSetting[character]) {
                                        if (typeof translatedSetting[character] === 'string') {
                                            newArr.fixed.push(translatedSetting[character]);
                                        } else {
                                            const translatedName = translatedSetting[character].name;
                                            newArr.mutable[translatedName] = translatedSetting[character].value;
                                        }
                                    }
                                });
                            } else if (translatedSetting[settingValueArray[i]]) {
                                const translatedName = translatedSetting[settingValueArray[i]].name;
                                newArr.mutable[translatedName] = translatedSetting[settingValueArray[i]].value;
                            }
                        } else {
                            // settings.mutable[subSettingName] = settingValueArray[i];
                        }
                    }
                });

            } else {
               newArr.mutable[item] = itemValue;
            }

        });
        return newArr;

    }

    setSettings(settingsStr: string): ElementSettings {
      // clean the possible newline special characters.

      const settingsArr = settingsStr.split(';');
      let settings: ElementSettings = {
          fixed: [],
          mutable: {},
      } as ElementSettings;

      settingsArr.forEach(setting => {
            const settingName = setting.split('=')[0];
            const settingValue = setting.split('=')[1];
            settings.mutable[settingName] = settingValue;
      });

      console.log(settings);

      settings = this.translateSettings(settings);

      console.log(settings);

      return settings;
    }

    getElementSettings(elementStr: string) {

        const positionStr = elementStr.substring(0, elementStr.indexOf('('));
        const settingsStr = elementStr.substring(elementStr.indexOf('(') + 1, elementStr.indexOf(')'));
        let bodyStr = elementStr.substring(elementStr.indexOf(')') + 1);

        // Remove only the last special character.
        if (bodyStr.substr(0, 2) !== '\r') {
          bodyStr = bodyStr.substring(0, bodyStr.length - 2);
        }

        // get position
        const splitElement = positionStr.split(',');

        const settings = this.setSettings(settingsStr);

        // get optional body
        const body = {
          type: null,
          content: null,
        };
        if (bodyStr && bodyStr.charAt(0) !== ';') {
            body.type = bodyStr.charAt(0);
            if (bodyStr.length > 1) {

                // Exclude the additional quotation marks
                body.content = bodyStr.substring(2, bodyStr.length - 1);
            }
        }
        const elementObj: PageElement = {
            resolution: {
                left: parseInt(splitElement[0], 10),
                top: parseInt(splitElement[1], 10),
                right: parseInt(splitElement[2], 10),
                bottom: parseInt(splitElement[3], 10),
            },
            settings,
        };

        if (body.type) {
          elementObj.body = body;
        }
        return elementObj;
    }

    fetchPageByNumber(pageNumber) {
        return new Promise(async (resolve, reject) => {
            if (pageNumber) {
                let connection;
                try {
                    connection = await oracledb.getConnection({
                        user : 'ROOT',
                        password : 'w3lcome',
                        connectString : 'SteveTest22:1521/SteveTest22.kickstart.local'
                    });
                } catch (err) {
                    console.log("Error: ", err);
                    return reject(err);
                } finally {
                    if (connection) {
                        try {
                            await connection.execute(
                              `SELECT PAGE_DESCRIPTION FROM FIDSMON_PAGE_DESC WHERE key_page=${pageNumber}`, [],  ((err, result) => {
                                  if (err) {
                                      reject(err.message);
                                  } else {
                                      if (result && result.rows && result.rows[0] && result.rows[0][0]) {
                                         return resolve(result.rows[0][0]);
                                      } else {
                                         return reject('no data');
                                      }
                                  }
                              })
                            );
                        } catch (err) {
                           reject(err);
                        }
                    }
                }
            }
        });
    }

    checkIfElement(elementsArray: string[]): boolean  {
        let result = true;
        if (elementsArray.length < 4) {
            result = false;
        }
        elementsArray.forEach(element => {
            if (isNaN(parseInt(element, 10))) {
                result = false;
            }
        });
        return result;
    }
}
