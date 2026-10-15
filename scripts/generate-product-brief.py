from pathlib import Path
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
root=Path(__file__).resolve().parent.parent
font_pairs = [
    ('C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'),
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
    ('/Library/Fonts/Arial.ttf', '/Library/Fonts/Arial Bold.ttf'),
]
fonts = next((pair for pair in font_pairs if all(Path(p).exists() for p in pair)), None)
if fonts is None:
    raise RuntimeError('Install Arial or DejaVu Sans for Cyrillic PDF generation.')
pdfmetrics.registerFont(TTFont('Arial', fonts[0]))
pdfmetrics.registerFont(TTFont('Arial-Bold', fonts[1]))
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyRU',fontName='Arial',fontSize=10.2,leading=14,spaceAfter=8,textColor=colors.HexColor('#172033')))
styles.add(ParagraphStyle(name='TitleRU',fontName='Arial-Bold',fontSize=30,leading=35,spaceAfter=10,textColor=colors.HexColor('#172033')))
styles.add(ParagraphStyle(name='HeadRU',fontName='Arial-Bold',fontSize=15,leading=20,spaceBefore=8,spaceAfter=8,textColor=colors.HexColor('#2563EB')))
styles.add(ParagraphStyle(name='SmallRU',fontName='Arial',fontSize=8,leading=11,spaceAfter=5,textColor=colors.HexColor('#667085')))
story=[]
def p(t,style='BodyRU'):story.append(Paragraph(t,styles[style]))
def h(t):p(t,'HeadRU')
p('Согласовано','TitleRU');p('MVP для согласования ремонта в небольших мастерских Ташкента. Актуализация: 15 октября 2026.','SmallRU')
h('Проблема и аудитория')
p('Мастерской нужно объяснить обнаруженную проблему, согласовать работы и сохранить ответ клиента. В переписке и устных обсуждениях точные условия могут теряться. Это гипотеза, которую предстоит проверить. Начальная аудитория: владельцы небольших мастерских по ремонту телефонов и ноутбуков в Ташкенте, которые сами ведут общение и не хотят внедрять большую CRM.')
h('Три действия продукта')
p('<b>1. Мастер составляет смету.</b> Вводит устройство, работы, цены, срок и гарантию. Пишет объяснение вручную или проверяет AI-черновик. Публикует и отправляет ссылку в Telegram вручную.<br/><b>2. Клиент отвечает.</b> Открывает страницу без регистрации, задаёт вопрос, согласует ремонт или отказывается. При вопросе сначала получает ответ мастерской.<br/><b>3. Владелец отслеживает результат.</b> Видит статусы, обсуждение и версии. После изменения цены новая версия требует отдельного согласования.')
h('Отличие и границы')
p('Выбран узкий сценарий: понятная смета и решение клиента. Локальная адаптация: русский интерфейс, суммы в UZS, время Asia/Tashkent. Предполагаемое отличие: простой запуск и короткий путь клиента. Преимущество по скорости ещё не измерено. Нет склада, кассы, онлайн-оплаты, Telegram-бота и полноценной CRM. Нажатие кнопки фиксирует ответ держателя ссылки, без проверки личности и без квалифицированной электронной подписи.')
h('Конкуренты')
rows=[['Продукт','Подтверждено официальным источником'],['RepairDesk','Управление сметами, фильтры, позиции работ, печать/PDF.'],['Orderry','Публичное принятие/отказ, отправка сметы, печать/PDF.'],['Jobber','Согласование в client hub и запрос изменений.']]
table=Table([[Paragraph(x,styles['BodyRU']) for x in row] for row in rows],colWidths=[110,397],hAlign='LEFT')
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#EFF6FF')),('GRID',(0,0),(-1,-1),.5,colors.HexColor('#E2E8F0')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
story.append(table)
p('У продукта есть конкуренты. Их тарифы и региональная доступность не проверялись. Сравнение ограничено функциями, описанными на официальных страницах.','SmallRU')
story.append(PageBreak())
p('Цена, пилот и первые продажи','TitleRU')
h('Цена-гипотеза')
p('<b>199 000 сум в месяц.</b> Гипотеза, не действующий тариф. Биллинга, интервью, продаж и платящих пользователей пока нет. Себестоимость хостинга, AI и поддержки нужно измерить перед продажей.')
h('План первых продаж')
p('<b>Первый кандидат для разговора - FixUp.</b> Сайт описывает ремонт ноутбуков в Ташкенте, согласование цены и общение в Telegram. Соответствие сегменту предполагается по сайту; контакта и пилота не было.<br/><b>Неделя 1.</b> Отобрать 15-20 мастерских, провести пять разговоров о текущем процессе, предложить 3-5 пилотов.<br/><b>Недели 2-3.</b> С согласия участников провести двухнедельный пилот на реальных случаях. Помочь с первой сметой, далее наблюдать самостоятельную работу. Демоданные не считать активностью.<br/><b>Неделя 4.</b> Сравнить с исходным процессом, предложить продолжение за 199 000 сум, записать ответы и причины отказов. Оплату считать результатом только после её получения. План пока не выполнен.')
h('Метрики пилота')
p('Основные метрики: время от начала ввода до проверенной публикации и время от отправки ссылки до решения. Отправка выполняется вручную и в MVP не отслеживается, поэтому её время фиксируется в пилотном журнале. Сравнивать медианы по мастерским, отдельно учитывать AI и ручной режим, а также случаи с вопросами. Дополнительно: доля смет с ответом, число уточнений, исправления AI-текста и готовность платить.')
h('Что уже работает и что проверить дальше')
p('Проверены PostgreSQL, основной сценарий, изоляция, конкурентные ответы, версии, резервное восстановление всех 15 таблиц и чистые миграции. Есть каталог, локальная копия ввода и печать. Текстовый AI: 16 из 20 ответов прошли проверку, один отклонён, три ограничены; это не точность модели. Новый AI-подбор по каталогу проверен тестами; live-запрос получил 429. Публичного HTTPS и восстановления пароля нет. Нужны проверка AI-подбора, наблюдение у мастеров, восстановление доступа и HTTPS-пилот. Платные AI-модели по умолчанию заблокированы до согласования расходов.')
h('Источники, проверены 15.10.2026')
p('<link href="https://help.repairdesk.co/portal/en/kb/articles/manage-estimates-new" color="#2563EB">RepairDesk: Manage Estimates</link> / <link href="https://help.orderry.com/en/articles/9130810-how-to-send-an-estimate-to-a-client-for-approval" color="#2563EB">Orderry: Send an Estimate</link><br/><link href="https://getjobber.zendesk.com/hc/en-us/articles/115012715008-Quote-Approvals" color="#2563EB">Jobber: Quote Approvals</link> / <link href="https://fixup.uz/" color="#2563EB">FixUp: потенциальный участник разговора</link>','SmallRU')
def footer(c,d):
    c.setFont('Arial',8);c.setFillColor(colors.HexColor('#667085'));c.drawString(44,26,'Согласовано / Материалы для сдачи');c.drawRightString(551,26,str(d.page))
doc=SimpleDocTemplate(str(root/'delivery/soglasovano-product-brief.pdf'),pagesize=(595.28,841.89),leftMargin=44,rightMargin=44,topMargin=38,bottomMargin=44,title='Согласовано - продукт и план первых продаж',author='Согласовано')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print('Product brief exported.')
