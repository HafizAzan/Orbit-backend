import { IsEnum } from 'class-validator';
import { AppUiTheme } from '../../enum/app-ui-theme.enum';

export class UpdateUiThemeDto {
  @IsEnum(AppUiTheme)
  uiTheme: AppUiTheme;
}
